class ReplaceHardwareDefinitionsWithFunctionalConfigurations < ActiveRecord::Migration[8.1]
  def up
    create_table :fdr_functional_configurations do |t|
      t.integer :version, null: false
      t.text :planned_capabilities, null: false
      t.timestamps
    end
    add_index :fdr_functional_configurations, :version, unique: true
    add_check_constraint :fdr_functional_configurations, "version >= 0", name: "fdr_configuration_version_nonnegative"
    add_reference :assemblies, :fdr_functional_configuration, foreign_key: true
    add_column :assemblies, :assembly_type, :string
    add_column :assemblies, :assembly_method, :string
    add_column :assemblies, :legacy_identity, :jsonb, default: {}, null: false

    # Retain the source identity without rewriting frozen builds or recordings.
    execute <<~SQL
      UPDATE assemblies a SET legacy_identity = jsonb_build_object(
        'name', a.name, 'serial_number', a.serial_number, 'definition', to_jsonb(h)
      ) FROM hardware_definitions h WHERE h.id = a.hardware_definition_id
    SQL

    select_all("SELECT DISTINCT functional_version FROM hardware_definitions WHERE product_name = 'ExoFDR' AND family_code = 'FDR'").each do |row|
      version = Integer(row.fetch("functional_version"))
      # Migrate the documented baseline, not a permanent seed catalogue.
      capabilities = version.zero? ? "XIAO ECU, BNO085 IMU, airspeed, GNSS and microSD. No radio or integrated independent power supply." : "Migrated configuration. Review and document its planned capabilities before creating an assembly."
      execute <<~SQL
        INSERT INTO fdr_functional_configurations (version, planned_capabilities, created_at, updated_at)
        VALUES (#{version}, #{quote(capabilities)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      SQL
    end

    counters = Hash.new(0)
    select_all(<<~SQL).each do |row|
      SELECT a.id, h.functional_version, h.implementation_kind, c.id AS configuration_id
      FROM assemblies a JOIN hardware_definitions h ON h.id = a.hardware_definition_id
      JOIN fdr_functional_configurations c ON c.version = h.functional_version
      WHERE h.product_name = 'ExoFDR' AND h.family_code = 'FDR'
      ORDER BY a.created_at, a.id
    SQL
      method = { "perfboard" => "PERF", "pcb" => "PCB" }.fetch(row.fetch("implementation_kind"))
      prefix = "EXOFDR-V#{row.fetch('functional_version')}-#{method}"
      serial = format("%s-%02d", prefix, counters[prefix] += 1)
      execute <<~SQL
        UPDATE assemblies SET assembly_type = 'ExoFDR', assembly_method = #{quote(method)},
          fdr_functional_configuration_id = #{Integer(row.fetch('configuration_id'))},
          serial_number = #{quote(serial)}, name = #{quote(serial)} WHERE id = #{Integer(row.fetch('id'))}
      SQL
    end
    counters.each do |prefix, value|
      execute <<~SQL
        INSERT INTO identifier_sequences (name, last_value, created_at, updated_at)
        VALUES (#{quote(prefix)}, #{value}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (name) DO UPDATE SET last_value = GREATEST(identifier_sequences.last_value, EXCLUDED.last_value)
      SQL
    end
    remove_reference :assemblies, :hardware_definition, foreign_key: true
    drop_table :hardware_definitions
    add_check_constraint :assemblies, "assembly_type IS NULL OR (assembly_type = 'ExoFDR' AND fdr_functional_configuration_id IS NOT NULL AND assembly_method IN ('PERF', 'PCB') AND serial_number IS NOT NULL AND name = serial_number)", name: "assemblies_exofdr_identity"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Restore a pre-migration backup to restore the former catalogue; source identities are retained in assemblies.legacy_identity."
  end
end
