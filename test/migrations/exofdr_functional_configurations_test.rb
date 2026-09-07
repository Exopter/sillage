require "test_helper"
require Rails.root.join("db/migrate/20260907120000_replace_hardware_definitions_with_functional_configurations").to_s

class ExofdrFunctionalConfigurationsTest < ActiveSupport::TestCase
  test "migration assigns identities per combination and preserves source references and frozen history" do
    ActiveRecord::Base.connection_pool.with_connection do |connection|
      schema = "exofdr_migration_#{SecureRandom.hex(6)}"
      previous_path = connection.schema_search_path
      connection.execute("CREATE SCHEMA #{schema}")
      connection.schema_search_path = schema
      connection.create_table(:hardware_definitions) do |t|
        t.string :product_name, :family_code, :implementation_kind, :canonical_identifier
        t.integer :functional_version
      end
      connection.create_table(:assemblies) do |t|
        t.string :name, :serial_number, :internal_number
        t.references :hardware_definition, foreign_key: true
        t.timestamps
      end
      connection.create_table(:identifier_sequences) do |t|
        t.string :name, index: { unique: true }
        t.integer :last_value
        t.timestamps
      end
      connection.create_table(:builds) { |t| t.jsonb :assembly_snapshot }
      connection.execute(<<~SQL)
        INSERT INTO hardware_definitions (id, product_name, family_code, functional_version, implementation_kind, canonical_identifier)
        VALUES (1, 'ExoFDR', 'FDR', 0, 'perfboard', 'FDR-V0-PERF-01'),
               (2, 'ExoFDR', 'FDR', 0, 'pcb', 'FDR-V0-PCB-REV-A-GH');
        INSERT INTO assemblies (id, name, serial_number, internal_number, hardware_definition_id, created_at, updated_at)
        VALUES (1, 'Old first recorder', 'FDR-0001', 'EXO-0001', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
               (2, 'Old second recorder', 'FDR-0002', 'EXO-0002', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
               (3, 'Old PCB recorder', 'FDR-0003', 'EXO-0003', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
               (4, 'Legacy generic equipment', NULL, 'EXO-0004', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO builds (assembly_snapshot) VALUES ('{"serial_number":"FDR-0001","name":"Old first recorder"}');
      SQL
      previous_verbose = ActiveRecord::Migration.verbose
      ActiveRecord::Migration.verbose = false
      ReplaceHardwareDefinitionsWithFunctionalConfigurations.new.migrate(:up)

      rows = connection.select_all("SELECT * FROM assemblies ORDER BY id").to_a
      assert_equal %w[EXOFDR-V0-PERF-01 EXOFDR-V0-PERF-02 EXOFDR-V0-PCB-01], rows.first(3).map { |row| row.fetch("serial_number") }
      assert_equal rows.first.fetch("serial_number"), rows.first.fetch("name")
      assert_equal "EXO-0001", rows.first.fetch("internal_number")
      legacy = JSON.parse(rows.first.fetch("legacy_identity"))
      assert_equal "FDR-0001", legacy.fetch("serial_number")
      assert_equal "FDR-V0-PERF-01", legacy.dig("definition", "canonical_identifier")
      assert_equal "Legacy generic equipment", rows.last.fetch("name")
      assert_nil rows.last.fetch("assembly_type")
      assert_equal 2, connection.select_value("SELECT last_value FROM identifier_sequences WHERE name = 'EXOFDR-V0-PERF'")
      assert_equal 1, connection.select_value("SELECT COUNT(*) FROM fdr_functional_configurations")
      assert_not connection.table_exists?(:hardware_definitions)
      assert_equal "FDR-0001", JSON.parse(connection.select_value("SELECT assembly_snapshot FROM builds"))["serial_number"]
    ensure
      ActiveRecord::Migration.verbose = previous_verbose unless previous_verbose.nil?
      connection.schema_search_path = previous_path if previous_path
      connection.execute("DROP SCHEMA #{schema} CASCADE") if schema
      connection.schema_cache.clear!
    end
  end
end
