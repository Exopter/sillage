class AddFdrComponentIdentities < ActiveRecord::Migration[8.1]
  def up
    add_column :assemblies, :fdr_component_type, :string
    remove_check_constraint :assemblies, name: "assemblies_exofdr_identity"
    add_check_constraint :assemblies, <<~SQL.squish, name: "assemblies_exofdr_identity"
      COALESCE(((assembly_type IS NULL OR assembly_type IN ('Parachute', 'Exowing')) AND fdr_component_type IS NULL OR
      (assembly_type = 'ExoFDR' AND fdr_functional_configuration_id IS NOT NULL AND
       serial_number IS NOT NULL AND name = serial_number AND
       ((fdr_component_type IS NULL AND assembly_method IN ('PERF', 'PCB')) OR
        (fdr_component_type = 'SYSTEMS' AND assembly_method IS NULL) OR
        (fdr_component_type IN ('MAIN', 'CENTRAL', 'AIRSPEED', 'DISPLAY', 'LITE') AND assembly_method = 'PCB')))), FALSE)
    SQL

    create_table :fdr_system_memberships do |t|
      t.references :system_assembly, null: false, foreign_key: { to_table: :assemblies }
      t.references :module_assembly, null: false, foreign_key: { to_table: :assemblies }
      t.string :component_type, null: false
      t.datetime :installed_at, null: false
      t.datetime :removed_at
      t.timestamps
    end
    add_index :fdr_system_memberships, :module_assembly_id, unique: true,
      where: "removed_at IS NULL", name: "one_active_system_per_fdr_module"
    add_index :fdr_system_memberships, [ :system_assembly_id, :component_type ], unique: true,
      where: "removed_at IS NULL", name: "one_active_fdr_module_per_role"
    add_check_constraint :fdr_system_memberships, "system_assembly_id <> module_assembly_id", name: "fdr_membership_not_self"
    add_check_constraint :fdr_system_memberships, "component_type IN ('MAIN', 'CENTRAL', 'AIRSPEED', 'DISPLAY')", name: "fdr_membership_module_type"
    add_check_constraint :fdr_system_memberships, "removed_at IS NULL OR removed_at >= installed_at", name: "fdr_membership_period"
  end

  def down
    if select_value("SELECT COUNT(*) FROM assemblies WHERE fdr_component_type IS NOT NULL").to_i.positive?
      raise ActiveRecord::IrreversibleMigration, "Typed FDR identities and membership history must be retained."
    end
    drop_table :fdr_system_memberships
    remove_check_constraint :assemblies, name: "assemblies_exofdr_identity"
    remove_column :assemblies, :fdr_component_type
    add_check_constraint :assemblies, <<~SQL.squish, name: "assemblies_exofdr_identity"
      assembly_type IS NULL OR assembly_type IN ('Parachute', 'Exowing') OR
      (assembly_type = 'ExoFDR' AND fdr_functional_configuration_id IS NOT NULL AND
       assembly_method IN ('PERF', 'PCB') AND serial_number IS NOT NULL AND name = serial_number)
    SQL
  end
end
