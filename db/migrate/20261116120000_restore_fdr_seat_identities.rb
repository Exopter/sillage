# Production ran the Seat rename on 11 November, then had the Main names put
# back on 16 November while the application code still expected them, with
# constraints widened to accept both. This settles on Seat again and is safe on
# a database in either state.
class RestoreFdrSeatIdentities < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :assemblies, name: "assemblies_exofdr_identity", if_exists: true
    remove_check_constraint :fdr_system_memberships, name: "fdr_membership_module_type", if_exists: true
    execute <<~SQL
      UPDATE assemblies SET
        legacy_identity = jsonb_set(legacy_identity, '{former_serial_numbers}',
          COALESCE(legacy_identity -> 'former_serial_numbers', '[]'::jsonb) || to_jsonb(serial_number)),
        serial_number = replace(serial_number, '-MAIN-', '-SEAT-'),
        name = replace(serial_number, '-MAIN-', '-SEAT-'), fdr_component_type = 'SEAT'
      WHERE fdr_component_type = 'MAIN';
      UPDATE fdr_system_memberships SET component_type = 'SEAT' WHERE component_type = 'MAIN';
      INSERT INTO identifier_sequences (name, last_value, created_at, updated_at)
      SELECT replace(name, '-MAIN', '-SEAT'), last_value, created_at, CURRENT_TIMESTAMP
      FROM identifier_sequences WHERE name ~ '^EXOFDR-V[0-9]+-MAIN$'
      ON CONFLICT (name) DO UPDATE SET last_value = GREATEST(identifier_sequences.last_value, EXCLUDED.last_value);
      DELETE FROM identifier_sequences WHERE name ~ '^EXOFDR-V[0-9]+-MAIN$';
    SQL
    add_check_constraint :assemblies, <<~SQL.squish, name: "assemblies_exofdr_identity"
      COALESCE(((assembly_type IS NULL OR assembly_type IN ('Parachute', 'Exowing')) AND fdr_component_type IS NULL OR
      (assembly_type = 'ExoFDR' AND fdr_functional_configuration_id IS NOT NULL AND
       serial_number IS NOT NULL AND name = serial_number AND
       ((fdr_component_type IS NULL AND assembly_method IN ('PERF', 'PCB')) OR
        (fdr_component_type = 'SYSTEMS' AND assembly_method IS NULL) OR
        (fdr_component_type IN ('SEAT', 'CENTRAL', 'AIRSPEED', 'DISPLAY', 'LITE') AND assembly_method = 'PCB')))), FALSE)
    SQL
    add_check_constraint :fdr_system_memberships, "component_type IN ('SEAT', 'CENTRAL', 'AIRSPEED', 'DISPLAY')", name: "fdr_membership_module_type"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Issued Seat identities must retain their history."
  end
end
