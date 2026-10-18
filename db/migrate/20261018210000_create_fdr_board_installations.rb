class CreateFdrBoardInstallations < ActiveRecord::Migration[8.0]
  def up
    create_table :fdr_board_installations do |t|
      t.references :assembly, null: false, foreign_key: true
      t.references :embedded_controller, null: false, foreign_key: true
      t.datetime :installed_at, null: false
      t.datetime :removed_at
      t.timestamps
    end
    add_index :fdr_board_installations, :assembly_id, unique: true,
      where: "removed_at IS NULL", name: "one_active_board_per_fdr"
    add_index :fdr_board_installations, :embedded_controller_id, unique: true,
      where: "removed_at IS NULL", name: "one_active_fdr_per_board"
    add_check_constraint :fdr_board_installations, "removed_at IS NULL OR removed_at > installed_at",
      name: "fdr_board_installation_dates"

    # Copy dated provenance, retaining all legacy parts, identifiers and keys.
    # Ambiguous active assignments fail the unique indexes instead of guessing.
    execute <<~SQL
      INSERT INTO fdr_board_installations
        (assembly_id, embedded_controller_id, installed_at, removed_at, created_at, updated_at)
      SELECT pi.assembly_id, ec.id, pi.installed_at, pi.removed_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM part_installations pi
      JOIN embedded_controllers ec ON ec.part_id = pi.part_id
      JOIN assemblies a ON a.id = pi.assembly_id
      WHERE a.assembly_type = 'ExoFDR'
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "FDR board replacement history must be retained"
  end
end
