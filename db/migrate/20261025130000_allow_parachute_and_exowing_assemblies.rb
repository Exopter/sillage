class AllowParachuteAndExowingAssemblies < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :assemblies, name: "assemblies_exofdr_identity"
    add_check_constraint :assemblies, <<~SQL.squish, name: "assemblies_exofdr_identity"
      assembly_type IS NULL OR assembly_type IN ('Parachute', 'Exowing') OR
      (assembly_type = 'ExoFDR' AND fdr_functional_configuration_id IS NOT NULL AND
       assembly_method IN ('PERF', 'PCB') AND serial_number IS NOT NULL AND name = serial_number)
    SQL
  end

  def down
    remove_check_constraint :assemblies, name: "assemblies_exofdr_identity"
    add_check_constraint :assemblies, <<~SQL.squish, name: "assemblies_exofdr_identity"
      assembly_type IS NULL OR
      (assembly_type = 'ExoFDR' AND fdr_functional_configuration_id IS NOT NULL AND
       assembly_method IN ('PERF', 'PCB') AND serial_number IS NOT NULL AND name = serial_number)
    SQL
  end
end
