class ModelSerializedFdrsAndEmbeddedControllers < ActiveRecord::Migration[8.1]
  class HardwareDefinitionRecord < ActiveRecord::Base
    self.table_name = "hardware_definitions"
  end

  HARDWARE_DEFINITIONS = [
    {
      product_name: "ExoFDR",
      family_code: "FDR",
      functional_version: 0,
      implementation_kind: "perfboard",
      implementation_revision: "01",
      variant: nil,
      canonical_identifier: "FDR-V0-PERF-01"
    },
    {
      product_name: "ExoFDR",
      family_code: "FDR",
      functional_version: 0,
      implementation_kind: "pcb",
      implementation_revision: "A",
      variant: "GH",
      canonical_identifier: "FDR-V0-PCB-REV-A-GH"
    },
    {
      product_name: "ExoFDR",
      family_code: "FDR",
      functional_version: 0,
      implementation_kind: "pcb",
      implementation_revision: "A",
      variant: "XH",
      canonical_identifier: "FDR-V0-PCB-REV-A-XH"
    }
  ].freeze

  NOTION_CONVENTION_URL = "https://app.notion.com/p/3d1e497e504f8128be4cd30a29db7732"

  def up
    create_hardware_definitions
    add_assembly_identity
    rename_embedded_devices
    attach_controllers_to_controller_parts
    create_part_installation_history
    classify_known_perfboard_fdr
  end

  def down
    restore_current_part_assignments
    restore_controller_assembly_assignments

    drop_table :part_installations
    remove_reference :embedded_controllers, :part, foreign_key: true
    rename_embedded_controllers_back

    remove_index :assemblies, name: "index_assemblies_on_lower_serial_number"
    remove_column :assemblies, :serviceability_state
    remove_column :assemblies, :serial_number
    remove_reference :assemblies, :hardware_definition, foreign_key: true
    drop_table :hardware_definitions
  end

  private

  def create_hardware_definitions
    create_table :hardware_definitions do |t|
      t.string :product_name, null: false
      t.string :family_code, null: false
      t.integer :functional_version, null: false
      t.string :implementation_kind, null: false
      t.string :implementation_revision, null: false
      t.string :variant
      t.string :canonical_identifier, null: false
      t.string :qualification_state, null: false, default: "prototype"
      t.string :notion_url
      t.timestamps
    end
    add_index :hardware_definitions, :canonical_identifier, unique: true

    now = Time.current
    HARDWARE_DEFINITIONS.each do |attributes|
      HardwareDefinitionRecord.create!(
        **attributes,
        qualification_state: "prototype",
        notion_url: NOTION_CONVENTION_URL,
        created_at: now,
        updated_at: now
      )
    end
  end

  def add_assembly_identity
    add_reference :assemblies, :hardware_definition, foreign_key: true
    add_column :assemblies, :serial_number, :string
    add_column :assemblies, :serviceability_state, :string, null: false, default: "in_preparation"
    add_index :assemblies, "LOWER(serial_number)", unique: true,
      where: "serial_number IS NOT NULL AND serial_number != ''",
      name: "index_assemblies_on_lower_serial_number"
  end

  def rename_embedded_devices
    rename_table :embedded_devices, :embedded_controllers
    rename_column :signal_presences, :embedded_device_id, :embedded_controller_id
    rename_column :device_activities, :embedded_device_id, :embedded_controller_id
    rename_column :fdr_wifi_profiles, :embedded_device_id, :embedded_controller_id
    rename_column :fdr_wifi_uploads, :embedded_device_id, :embedded_controller_id
    rename_column :fdr_recording_commands, :embedded_device_id, :embedded_controller_id
  end

  def rename_embedded_controllers_back
    rename_column :signal_presences, :embedded_controller_id, :embedded_device_id
    rename_column :device_activities, :embedded_controller_id, :embedded_device_id
    rename_column :fdr_wifi_profiles, :embedded_controller_id, :embedded_device_id
    rename_column :fdr_wifi_uploads, :embedded_controller_id, :embedded_device_id
    rename_column :fdr_recording_commands, :embedded_controller_id, :embedded_device_id
    rename_table :embedded_controllers, :embedded_devices
  end

  def attach_controllers_to_controller_parts
    add_reference :embedded_controllers, :part, foreign_key: true, index: { unique: true }

    select_rows("SELECT id, assembly_id FROM embedded_controllers WHERE assembly_id IS NOT NULL").each do |controller_id, assembly_id|
      part_ids = select_values(<<~SQL.squish)
        SELECT parts.id
        FROM parts
        INNER JOIN functions ON functions.id = parts.function_id
        WHERE parts.assembly_id = #{connection.quote(assembly_id)}
          AND functions.code = 'CONTROLLER'
        ORDER BY parts.id
      SQL
      unless part_ids.one?
        raise ActiveRecord::IrreversibleMigration,
          "Assembly #{assembly_id} must have exactly one CONTROLLER part before its embedded controller can be migrated."
      end

      execute <<~SQL.squish
        UPDATE embedded_controllers
        SET part_id = #{connection.quote(part_ids.first)}
        WHERE id = #{connection.quote(controller_id)}
      SQL
    end

    remove_reference :embedded_controllers, :assembly, foreign_key: true
  end

  def create_part_installation_history
    create_table :part_installations do |t|
      t.references :part, null: false, foreign_key: true
      t.references :assembly, null: false, foreign_key: true
      t.datetime :installed_at, null: false
      t.boolean :installed_at_estimated, null: false, default: false
      t.datetime :removed_at
      t.text :notes
      t.timestamps
    end
    add_index :part_installations, [ :part_id, :removed_at ]
    add_index :part_installations, :part_id, unique: true, where: "removed_at IS NULL",
      name: "index_active_part_installation_per_part"
    add_index :part_installations, [ :assembly_id, :removed_at ],
      name: "index_part_installations_on_assembly_and_removed_at"

    execute <<~SQL.squish
      INSERT INTO part_installations
        (part_id, assembly_id, installed_at, installed_at_estimated, notes, created_at, updated_at)
      SELECT
        id, assembly_id, created_at, TRUE,
        'Migrated current assignment; the original installation date was unavailable.',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM parts
      WHERE assembly_id IS NOT NULL
    SQL

    remove_reference :parts, :assembly, foreign_key: true
  end

  def classify_known_perfboard_fdr
    perfboard_id = HardwareDefinitionRecord.find_by!(canonical_identifier: "FDR-V0-PERF-01").id
    execute <<~SQL.squish
      UPDATE assemblies
      SET hardware_definition_id = #{connection.quote(perfboard_id)}
      WHERE id IN (
        SELECT DISTINCT part_installations.assembly_id
        FROM part_installations
        INNER JOIN parts ON parts.id = part_installations.part_id
        INNER JOIN functions ON functions.id = parts.function_id
        INNER JOIN embedded_controllers ON embedded_controllers.part_id = parts.id
        WHERE part_installations.removed_at IS NULL
          AND functions.code = 'CONTROLLER'
          AND embedded_controllers.device_id = 'EXOFDR-A172E0'
      )
    SQL
  end

  def restore_current_part_assignments
    add_reference :parts, :assembly, foreign_key: true
    execute <<~SQL.squish
      UPDATE parts
      SET assembly_id = part_installations.assembly_id
      FROM part_installations
      WHERE part_installations.part_id = parts.id
        AND part_installations.removed_at IS NULL
    SQL
  end

  def restore_controller_assembly_assignments
    add_reference :embedded_controllers, :assembly, foreign_key: true, index: { unique: true }
    execute <<~SQL.squish
      UPDATE embedded_controllers
      SET assembly_id = parts.assembly_id
      FROM parts
      WHERE parts.id = embedded_controllers.part_id
    SQL
  end
end
