# frozen_string_literal: true

require "digest"
require "json"

namespace :postgresql_migration do
  desc "Verify PostgreSQL row counts and every Active Storage object against a migration manifest"
  task verify: :environment do
    connection = ActiveRecord::Base.connection
    abort "PostgreSQL is required" unless connection.adapter_name == "PostgreSQL"

    manifest_path = ENV.fetch("MIGRATION_MANIFEST_PATH")
    manifest = JSON.parse(File.read(manifest_path))
    abort "Unsupported migration manifest version" unless manifest.fetch("version") == 1
    abort "Migration manifest is not verified" unless manifest.fetch("verified") == true
    abort "Invalid SQLite source digest" unless manifest.fetch("source_sha256").match?(/\A[0-9a-f]{64}\z/)

    expected_tables = connection.tables.reject do |table|
      table.start_with?("solid_") || %w[ar_internal_metadata schema_migrations].include?(table)
    end.sort
    manifest_tables = manifest.fetch("tables").keys.sort
    unless manifest_tables == expected_tables
      abort "Manifest table set differs from PostgreSQL: expected #{expected_tables.inspect}, found #{manifest_tables.inspect}"
    end

    expected_database = manifest.fetch("target_database")
    actual_database = connection.select_value("SELECT current_database()")
    restore_verification_path = ENV["POSTGRESQL_RESTORE_VERIFICATION"]
    if expected_database != actual_database
      confirmation = "VERIFY_RESTORED_POSTGRESQL_DUMP"
      unless restore_verification_path.present? && ENV["POSTGRESQL_RESTORE_CONFIRM"] == confirmation
        abort "Manifest targets #{expected_database}, connected to #{actual_database}; " \
          "set POSTGRESQL_RESTORE_VERIFICATION and POSTGRESQL_RESTORE_CONFIRM=#{confirmation} " \
          "only when verifying a separate restored dump"
      end
    end

    manifest.fetch("tables").each do |table, metrics|
      quoted_table = connection.quote_table_name(table)
      has_id = connection.columns(table).any? { |column| column.name == "id" }
      if has_id
        actual = connection.select_one(<<~SQL)
          SELECT COUNT(*) AS count,
                 MIN(id) AS minimum_id,
                 MAX(id) AS maximum_id,
                 COALESCE(SUM(id), 0) AS id_sum
          FROM #{quoted_table}
        SQL
        actual_metrics = {
          "count" => actual.fetch("count").to_i,
          "minimum_id" => actual.fetch("minimum_id")&.to_i,
          "maximum_id" => actual.fetch("maximum_id")&.to_i,
          "id_sum" => actual.fetch("id_sum").to_i
        }
      else
        actual_metrics = {
          "count" => connection.select_value("SELECT COUNT(*) FROM #{quoted_table}").to_i,
          "minimum_id" => nil,
          "maximum_id" => nil,
          "id_sum" => 0
        }
      end

      expected_metrics = metrics.slice("count", "minimum_id", "maximum_id", "id_sum")
      unless actual_metrics == expected_metrics
        abort "#{table}: expected #{expected_metrics.inspect}, found #{actual_metrics.inspect}"
      end
    end

    blob_count = 0
    blob_bytes = 0
    ActiveStorage::Blob.find_each do |blob|
      blob.open do |file|
        actual_size = File.size(file.path)
        abort "Active Storage size mismatch for #{blob.key}" unless actual_size == blob.byte_size

        blob_count += 1
        blob_bytes += actual_size
      end
    end

    if restore_verification_path.present?
      verification = {
        version: 1,
        verified: true,
        source_database: expected_database,
        database: actual_database,
        manifest_sha256: Digest::SHA256.file(manifest_path).hexdigest,
        source_sqlite_sha256: manifest.fetch("source_sha256"),
        active_storage_blobs: blob_count,
        active_storage_bytes: blob_bytes,
        verified_at: Time.current.iso8601
      }
      File.write(restore_verification_path, JSON.pretty_generate(verification) << "\n", mode: "wx", perm: 0o600)
    end

    puts "PostgreSQL migration verified: #{manifest.fetch('tables').size} tables, #{blob_count} blobs, #{blob_bytes} bytes"
  end
end
