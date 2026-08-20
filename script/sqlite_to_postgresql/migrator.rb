# frozen_string_literal: true

require "csv"
require "digest"
require "json"
require "pg"
require "sqlite3"
require "time"

module SqliteToPostgresql
  CONFIRMATION = "IMPORT_SQLITE_INTO_EMPTY_POSTGRESQL"
  NULL_MARKER = "__SILLAGE_MIGRATION_NULL_4D66C214__"
  TABLES = %w[
    active_storage_attachments
    active_storage_blobs
    active_storage_variant_records
    aircraft
    assemblies
    asset_identifiers
    builds
    device_activities
    embedded_devices
    fdr_recording_commands
    fdr_wifi_profiles
    fdr_wifi_uploads
    flight_imports
    flights
    functions
    installations
    operator_events
    parts
    sensor_samples
    sessions
    signal_batches
    signal_presences
    signal_sessions
    test_runs
    track_points
    users
    wifi_credentials
  ].freeze

  class Error < StandardError; end
  class SafetyError < Error; end
  class VerificationError < Error; end

  class Migrator
    attr_reader :manifest

    def initialize(source_path:, target_url:, manifest_path:, confirmation:, tables: TABLES, output: $stdout)
      @source_path = File.expand_path(source_path)
      @target_url = target_url
      @manifest_path = File.expand_path(manifest_path)
      @confirmation = confirmation
      @tables = tables.freeze
      @output = output
      @manifest = nil
    end

    def run!
      validate_inputs!
      started_at = Time.now.utc
      source_sha256 = file_sha256(@source_path)
      source = SQLite3::Database.new(@source_path, readonly: true)
      target = PG.connect(@target_url)
      source.results_as_hash = false

      verify_source!(source)
      verify_target!(source, target)
      table_results = copy_tables!(source, target)
      reset_sequences!(target, table_results)
      validate_foreign_keys!(target)
      compare_flight_record_counts!(source, target)
      target.exec("ANALYZE")

      @manifest = {
        version: 1,
        source_path: @source_path,
        source_sha256:,
        target_database: target.exec("SELECT current_database()").getvalue(0, 0),
        started_at: started_at.iso8601,
        completed_at: Time.now.utc.iso8601,
        tables: table_results,
        verified: true
      }
      write_manifest!
      log "Migration verified: #{@tables.size} tables copied into #{@manifest.fetch(:target_database)}"
      @manifest
    ensure
      source&.close
      target&.close
    end

    private

    def validate_inputs!
      raise SafetyError, "MIGRATION_CONFIRM must equal #{CONFIRMATION}" unless @confirmation == CONFIRMATION
      raise SafetyError, "SQLite source does not exist: #{@source_path}" unless File.file?(@source_path)
      source_sidecars = %w[-wal -shm].filter_map do |suffix|
        path = "#{@source_path}#{suffix}"
        path if File.exist?(path)
      end
      if source_sidecars.any?
        raise SafetyError,
          "SQLite source must be a consolidated backup without sidecars: #{source_sidecars.join(', ')}"
      end
      raise SafetyError, "TARGET_DATABASE_URL is required" if @target_url.to_s.empty?
      raise SafetyError, "At least one table is required" if @tables.empty?
      raise SafetyError, "Migration table names must be unique" unless @tables.uniq.size == @tables.size
    end

    def verify_source!(source)
      result = source.get_first_value("PRAGMA quick_check")
      raise VerificationError, "SQLite quick_check failed: #{result}" unless result == "ok"

      source_tables = source.execute("SELECT name FROM sqlite_master WHERE type = 'table'").flatten
      missing = @tables - source_tables
      raise VerificationError, "SQLite source is missing tables: #{missing.join(', ')}" if missing.any?
    end

    def verify_target!(source, target)
      database_name = target.exec("SELECT current_database()").getvalue(0, 0)
      if %w[postgres template0 template1].include?(database_name)
        raise SafetyError, "Refusing to migrate into administrative database #{database_name}"
      end

      target_tables = target.exec(<<~SQL).map { |row| row.fetch("table_name") }
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_type = 'BASE TABLE'
      SQL
      missing = @tables - target_tables
      raise VerificationError, "PostgreSQL target is missing tables: #{missing.join(', ')}" if missing.any?

      @tables.each do |table|
        source_columns = sqlite_columns(source, table)
        target_columns = postgresql_columns(target, table).map { |column| column.fetch("column_name") }
        missing_in_source = target_columns - source_columns
        unexpected_in_source = source_columns - target_columns
        next if missing_in_source.empty? && unexpected_in_source.empty?

        raise VerificationError,
          "Column mismatch for #{table}: missing in SQLite=#{missing_in_source.inspect}, " \
          "unexpected in SQLite=#{unexpected_in_source.inspect}"
      end

      data_tables = target_tables - %w[ar_internal_metadata schema_migrations]
      nonempty = data_tables.filter_map do |table|
        count = target.exec("SELECT COUNT(*) FROM #{target.quote_ident(table)}").getvalue(0, 0).to_i
        "#{table}=#{count}" if count.positive?
      end
      raise SafetyError, "PostgreSQL target must be empty: #{nonempty.join(', ')}" if nonempty.any?
    end

    def copy_tables!(source, target)
      results = {}
      target.exec("SET session_replication_role = replica")

      @tables.each do |table|
        log "Copying #{table}..."
        results[table] = copy_table!(source, target, table)
      end
      results
    ensure
      target.exec("SET session_replication_role = origin") if target&.status == PG::CONNECTION_OK
    end

    def copy_table!(source, target, table)
      columns = postgresql_columns(target, table)
      column_names = columns.map { |column| column.fetch("column_name") }
      quoted_columns = column_names.map { |column| target.quote_ident(column) }.join(", ")
      query = "SELECT #{column_names.map { |column| sqlite_quote(column) }.join(', ')} FROM #{sqlite_quote(table)}"
      query += " ORDER BY #{sqlite_quote('id')}" if column_names.include?("id")
      copy_sql = [
        "COPY #{target.quote_ident(table)} (#{quoted_columns})",
        "FROM STDIN WITH (FORMAT csv, NULL #{target.escape_literal(NULL_MARKER)})"
      ].join(" ")
      metrics = { "count" => 0, "minimum_id" => nil, "maximum_id" => nil, "id_sum" => 0 }
      id_index = column_names.index("id")

      target.exec("BEGIN")
      target.copy_data(copy_sql) do
        source.execute(query) do |row|
          values = row.each_with_index.map do |value, index|
            postgres_value(value, columns.fetch(index))
          end
          raise VerificationError, "Reserved NULL marker found in #{table}" if values.include?(NULL_MARKER)

          target.put_copy_data(CSV.generate_line(values.map { |value| value.nil? ? NULL_MARKER : value }))
          update_metrics!(metrics, row[id_index]) if id_index
          metrics["count"] += 1
        end
      end
      target.exec("COMMIT")

      target_metrics = target_metrics(target, table, !id_index.nil?)
      unless metrics == target_metrics
        raise VerificationError, "Verification mismatch for #{table}: source=#{metrics.inspect} target=#{target_metrics.inspect}"
      end

      metrics
    rescue StandardError
      target.exec("ROLLBACK") if target.transaction_status != PG::PQTRANS_IDLE
      raise
    end

    def reset_sequences!(target, table_results)
      table_results.each do |table, metrics|
        next unless postgresql_columns(target, table).any? { |column| column.fetch("column_name") == "id" }

        sequence = target.exec_params("SELECT pg_get_serial_sequence($1, 'id')", [ table ]).getvalue(0, 0)
        next if sequence.to_s.empty?

        if metrics.fetch("count").positive?
          target.exec_params("SELECT setval($1, $2, true)", [ sequence, metrics.fetch("maximum_id") ])
        else
          target.exec_params("SELECT setval($1, 1, false)", [ sequence ])
        end
      end
    end

    def validate_foreign_keys!(target)
      composite_constraints = target.exec(<<~SQL).map { |row| row.fetch("constraint_name") }
        SELECT c.conname AS constraint_name
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.connamespace = current_schema()::regnamespace
          AND (array_length(c.conkey, 1) != 1 OR array_length(c.confkey, 1) != 1)
      SQL
      if composite_constraints.any?
        raise VerificationError,
          "Composite foreign keys require an explicit verifier: #{composite_constraints.join(', ')}"
      end

      constraints = target.exec(<<~SQL)
        SELECT constraint_name,
               child_table,
               child_column,
               parent_table,
               parent_column
        FROM (
          SELECT c.conname AS constraint_name,
                 child_table.relname AS child_table,
                 child.attname AS child_column,
                 parent_table.relname AS parent_table,
                 parent.attname AS parent_column,
                 array_length(c.conkey, 1) AS child_column_count,
                 array_length(c.confkey, 1) AS parent_column_count
          FROM pg_constraint c
          JOIN pg_class child_table ON child_table.oid = c.conrelid
          JOIN pg_class parent_table ON parent_table.oid = c.confrelid
          JOIN pg_attribute child
            ON child.attrelid = c.conrelid AND child.attnum = c.conkey[1]
          JOIN pg_attribute parent
            ON parent.attrelid = c.confrelid AND parent.attnum = c.confkey[1]
          WHERE c.contype = 'f'
            AND c.connamespace = current_schema()::regnamespace
        ) foreign_keys
        WHERE child_column_count = 1 AND parent_column_count = 1
      SQL

      constraints.each do |constraint|
        child_table = target.quote_ident(constraint.fetch("child_table"))
        child_column = target.quote_ident(constraint.fetch("child_column"))
        parent_table = target.quote_ident(constraint.fetch("parent_table"))
        parent_column = target.quote_ident(constraint.fetch("parent_column"))
        orphan_count = target.exec(<<~SQL).getvalue(0, 0).to_i
          SELECT COUNT(*)
          FROM #{child_table} child
          LEFT JOIN #{parent_table} parent
            ON parent.#{parent_column} = child.#{child_column}
          WHERE child.#{child_column} IS NOT NULL
            AND parent.#{parent_column} IS NULL
        SQL
        next if orphan_count.zero?

        raise VerificationError,
          "Foreign key #{constraint.fetch('constraint_name')} has #{orphan_count} orphan rows"
      end
    end

    def compare_flight_record_counts!(source, target)
      (@tables & %w[track_points sensor_samples]).each do |table|
        source_counts = source.execute("SELECT flight_id, COUNT(*) FROM #{sqlite_quote(table)} GROUP BY flight_id").to_h
        target_counts = target.exec("SELECT flight_id, COUNT(*) FROM #{target.quote_ident(table)} GROUP BY flight_id")
          .to_h { |row| [ row.fetch("flight_id").to_i, row.fetch("count").to_i ] }
        next if source_counts == target_counts

        raise VerificationError, "Per-flight record counts differ for #{table}"
      end
    end

    def sqlite_columns(source, table)
      source.execute("PRAGMA table_info(#{sqlite_quote(table)})").map { |row| row.fetch(1) }
    end

    def postgresql_columns(target, table)
      target.exec_params(<<~SQL, [ table ]).map(&:freeze)
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
        ORDER BY ordinal_position
      SQL
    end

    def postgres_value(value, column)
      return if value.nil?

      case column.fetch("data_type")
      when "boolean"
        case value.to_s.downcase
        when "1", "t", "true" then "t"
        when "0", "f", "false" then "f"
        else raise VerificationError, "Invalid boolean value #{value.inspect} for #{column.fetch('column_name')}"
        end
      when "json", "jsonb"
        value.is_a?(String) ? JSON.generate(JSON.parse(value)) : JSON.generate(value)
      when "bytea"
        "\\x#{value.to_s.unpack1('H*')}"
      else
        value
      end
    end

    def update_metrics!(metrics, id)
      integer = Integer(id)
      metrics["minimum_id"] = integer if metrics["minimum_id"].nil? || integer < metrics["minimum_id"]
      metrics["maximum_id"] = integer if metrics["maximum_id"].nil? || integer > metrics["maximum_id"]
      metrics["id_sum"] += integer
    end

    def target_metrics(target, table, has_id)
      if has_id
        row = target.exec(<<~SQL).first
          SELECT COUNT(*) AS count,
                 MIN(id) AS minimum_id,
                 MAX(id) AS maximum_id,
                 COALESCE(SUM(id), 0) AS id_sum
          FROM #{target.quote_ident(table)}
        SQL
        {
          "count" => row.fetch("count").to_i,
          "minimum_id" => integer_or_nil(row.fetch("minimum_id")),
          "maximum_id" => integer_or_nil(row.fetch("maximum_id")),
          "id_sum" => row.fetch("id_sum").to_i
        }
      else
        count = target.exec("SELECT COUNT(*) FROM #{target.quote_ident(table)}").getvalue(0, 0).to_i
        { "count" => count, "minimum_id" => nil, "maximum_id" => nil, "id_sum" => 0 }
      end
    end

    def integer_or_nil(value)
      Integer(value) unless value.nil?
    end

    def sqlite_quote(identifier)
      %Q("#{identifier.to_s.gsub('"', '""')}")
    end

    def file_sha256(path)
      Digest::SHA256.file(path).hexdigest
    end

    def write_manifest!
      directory = File.dirname(@manifest_path)
      raise SafetyError, "Manifest directory does not exist: #{directory}" unless Dir.exist?(directory)

      File.write(@manifest_path, JSON.pretty_generate(@manifest) << "\n", mode: "wx", perm: 0o600)
    rescue Errno::EEXIST
      raise SafetyError, "Refusing to overwrite migration manifest: #{@manifest_path}"
    end

    def log(message)
      @output.puts(message)
    end
  end
end
