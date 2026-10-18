require "test_helper"
require Rails.root.join("db/migrate/20261018210000_create_fdr_board_installations").to_s

class FdrBoardInstallationsMigrationTest < ActiveSupport::TestCase
  test "copies dated assignments without changing hardware keys or identifiers" do
    ActiveRecord::Base.connection_pool.with_connection do |connection|
      schema = "fdr_binding_migration_#{SecureRandom.hex(6)}"
      previous_path = connection.schema_search_path
      previous_verbose = ActiveRecord::Migration.verbose
      connection.execute("CREATE SCHEMA #{schema}")
      connection.schema_search_path = schema
      connection.create_table(:assemblies) { |t| t.string :assembly_type, :serial_number }
      connection.create_table(:embedded_controllers) { |t| t.bigint :part_id; t.string :device_id, :fdr_auth_key_ciphertext }
      connection.create_table(:part_installations) { |t| t.bigint :part_id, :assembly_id; t.datetime :installed_at, :removed_at }
      connection.execute(<<~SQL)
        INSERT INTO assemblies VALUES (1, 'ExoFDR', 'EXOFDR-V1-PCB-01'), (2, NULL, NULL);
        INSERT INTO embedded_controllers VALUES (1, 10, 'ECU-E072A1F81D84', 'existing-ciphertext'), (2, 11, 'ECU-E072A1FA3E78', 'another-ciphertext');
        INSERT INTO part_installations VALUES
          (1, 10, 1, '2026-01-01', '2026-02-01'), (2, 11, 1, '2026-02-01', NULL), (3, 10, 2, '2026-02-01', NULL);
      SQL
      before = connection.select_all("SELECT * FROM embedded_controllers ORDER BY id").to_a
      ActiveRecord::Migration.verbose = false
      CreateFdrBoardInstallations.new.migrate(:up)
      rows = connection.select_all("SELECT * FROM fdr_board_installations ORDER BY installed_at").to_a
      assert_equal 2, rows.size
      assert_equal [ 1, 2 ], rows.map { |row| row.fetch("embedded_controller_id") }
      assert_equal Time.utc(2026, 2, 1), rows.first.fetch("removed_at")
      assert_nil rows.last.fetch("removed_at")
      assert_equal before, connection.select_all("SELECT * FROM embedded_controllers ORDER BY id").to_a
      assert connection.indexes(:fdr_board_installations).find { |index| index.name == "one_active_board_per_fdr" }.unique
      assert connection.indexes(:fdr_board_installations).find { |index| index.name == "one_active_fdr_per_board" }.unique
    ensure
      ActiveRecord::Migration.verbose = previous_verbose
      connection.schema_search_path = previous_path if previous_path
      connection.execute("DROP SCHEMA #{schema} CASCADE") if schema
      connection.schema_cache.clear!
    end
  end
end
