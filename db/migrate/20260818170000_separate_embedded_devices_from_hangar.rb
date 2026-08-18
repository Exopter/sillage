class SeparateEmbeddedDevicesFromHangar < ActiveRecord::Migration[8.1]
  class AssemblyRecord < ActiveRecord::Base
    self.table_name = "assemblies"
  end

  class EmbeddedDeviceRecord < ActiveRecord::Base
    self.table_name = "embedded_devices"
  end

  class SignalPresenceRecord < ActiveRecord::Base
    self.table_name = "signal_presences"
  end

  class WifiProfileRecord < ActiveRecord::Base
    self.table_name = "fdr_wifi_profiles"
  end

  class WifiUploadRecord < ActiveRecord::Base
    self.table_name = "fdr_wifi_uploads"
  end

  TECHNICAL_COLUMNS = %w[
    device_id device_model fdr_auth_key_ciphertext fdr_auth_key_installed_at
    last_seen_at last_seen_firmware last_sillage_seen_at last_sillage_status
    mavlink_component_id mavlink_system_id
  ].freeze

  def up
    create_table :embedded_devices do |t|
      t.references :assembly, foreign_key: true, index: { unique: true }
      t.string :device_id
      t.string :device_model
      t.text :fdr_auth_key_ciphertext
      t.datetime :fdr_auth_key_installed_at
      t.datetime :last_identified_at
      t.string :last_seen_firmware
      t.integer :mavlink_component_id
      t.integer :mavlink_system_id
      t.timestamps
    end
    add_index :embedded_devices, :device_id, unique: true,
      where: "device_id IS NOT NULL AND device_id != ''"

    create_table :signal_presences do |t|
      t.references :embedded_device, null: false, foreign_key: true, index: { unique: true }
      t.datetime :last_seen_at
      t.json :status, null: false, default: {}
      t.timestamps
    end
    add_index :signal_presences, :last_seen_at

    create_table :device_activities do |t|
      t.references :embedded_device, null: false, foreign_key: true
      t.references :actor, foreign_key: { to_table: :users }
      t.string :event_type, null: false
      t.string :source, null: false
      t.datetime :occurred_at, null: false
      t.json :details, null: false, default: {}
      t.timestamps
    end
    add_index :device_activities, %i[embedded_device_id occurred_at]
    add_index :device_activities, :event_type

    add_reference :fdr_wifi_profiles, :embedded_device, foreign_key: true
    add_reference :fdr_wifi_uploads, :embedded_device, foreign_key: true

    migrate_devices

    change_column_null :fdr_wifi_profiles, :embedded_device_id, false
    change_column_null :fdr_wifi_uploads, :embedded_device_id, false
    remove_legacy_wifi_profile_indexes
    remove_index :fdr_wifi_uploads, name: "index_fdr_wifi_uploads_on_recorder_file", if_exists: true
    remove_reference :fdr_wifi_profiles, :assembly, foreign_key: true
    remove_reference :fdr_wifi_uploads, :assembly, foreign_key: true
    add_index :fdr_wifi_profiles, %i[embedded_device_id wifi_credential_id], unique: true,
      name: "index_fdr_wifi_profiles_on_device_and_credential"
    add_index :fdr_wifi_profiles, %i[embedded_device_id position], unique: true,
      name: "index_fdr_wifi_profiles_on_device_and_position"
    add_index :fdr_wifi_uploads, %i[embedded_device_id boot_id file_index], unique: true,
      name: "index_fdr_wifi_uploads_on_recorder_file"

    TECHNICAL_COLUMNS.each { |column| remove_column :assemblies, column }
  end

  def down
    add_column :assemblies, :device_id, :string
    add_column :assemblies, :device_model, :string
    add_column :assemblies, :fdr_auth_key_ciphertext, :text
    add_column :assemblies, :fdr_auth_key_installed_at, :datetime
    add_column :assemblies, :last_seen_at, :datetime
    add_column :assemblies, :last_seen_firmware, :string
    add_column :assemblies, :last_sillage_seen_at, :datetime
    add_column :assemblies, :last_sillage_status, :json, null: false, default: {}
    add_column :assemblies, :mavlink_component_id, :integer
    add_column :assemblies, :mavlink_system_id, :integer
    add_index :assemblies, :device_id, unique: true,
      where: "device_id IS NOT NULL AND device_id != ''"
    add_index :assemblies, :last_sillage_seen_at

    remove_index :fdr_wifi_profiles, name: "index_fdr_wifi_profiles_on_device_and_credential", if_exists: true
    remove_index :fdr_wifi_profiles, name: "index_fdr_wifi_profiles_on_device_and_position", if_exists: true
    remove_legacy_wifi_profile_indexes
    remove_index :fdr_wifi_uploads, name: "index_fdr_wifi_uploads_on_recorder_file", if_exists: true
    add_reference :fdr_wifi_profiles, :assembly, foreign_key: true
    add_reference :fdr_wifi_uploads, :assembly, foreign_key: true

    restore_assemblies

    if WifiProfileRecord.where(assembly_id: nil).exists? || WifiUploadRecord.where(assembly_id: nil).exists?
      raise ActiveRecord::IrreversibleMigration,
        "FDR data created without a Hangar assembly cannot be restored to the previous schema."
    end

    change_column_null :fdr_wifi_profiles, :assembly_id, false
    change_column_null :fdr_wifi_uploads, :assembly_id, false
    add_index :fdr_wifi_profiles, %i[assembly_id wifi_credential_id], unique: true
    add_index :fdr_wifi_profiles, %i[assembly_id position], unique: true
    add_index :fdr_wifi_uploads, %i[assembly_id boot_id file_index], unique: true,
      name: "index_fdr_wifi_uploads_on_recorder_file"
    remove_reference :fdr_wifi_profiles, :embedded_device, foreign_key: true
    remove_reference :fdr_wifi_uploads, :embedded_device, foreign_key: true
    drop_table :device_activities
    drop_table :signal_presences
    drop_table :embedded_devices
  end

  private

  def migrate_devices
    reset_records
    assembly_ids = technical_assembly_ids

    AssemblyRecord.where(id: assembly_ids).find_each do |assembly|
      device = EmbeddedDeviceRecord.create!(
        assembly_id: assembly.id,
        device_id: assembly.device_id,
        device_model: assembly.device_model,
        fdr_auth_key_ciphertext: assembly.fdr_auth_key_ciphertext,
        fdr_auth_key_installed_at: assembly.fdr_auth_key_installed_at,
        last_identified_at: assembly.last_seen_at,
        last_seen_firmware: assembly.last_seen_firmware,
        mavlink_component_id: assembly.mavlink_component_id,
        mavlink_system_id: assembly.mavlink_system_id,
        created_at: assembly.created_at,
        updated_at: assembly.updated_at
      )

      if assembly.last_sillage_seen_at.present? || assembly.last_sillage_status.present?
        SignalPresenceRecord.create!(
          embedded_device_id: device.id,
          last_seen_at: assembly.last_sillage_seen_at,
          status: assembly.last_sillage_status || {},
          created_at: assembly.created_at,
          updated_at: assembly.updated_at
        )
      end

      WifiProfileRecord.where(assembly_id: assembly.id).update_all(embedded_device_id: device.id)
      WifiUploadRecord.where(assembly_id: assembly.id).update_all(embedded_device_id: device.id)
    end
  end

  def restore_assemblies
    reset_records

    EmbeddedDeviceRecord.where.not(assembly_id: nil).find_each do |device|
      presence = SignalPresenceRecord.find_by(embedded_device_id: device.id)
      AssemblyRecord.where(id: device.assembly_id).update_all(
        device_id: device.device_id,
        device_model: device.device_model,
        fdr_auth_key_ciphertext: device.fdr_auth_key_ciphertext,
        fdr_auth_key_installed_at: device.fdr_auth_key_installed_at,
        last_seen_at: device.last_identified_at,
        last_seen_firmware: device.last_seen_firmware,
        last_sillage_seen_at: presence&.last_seen_at,
        last_sillage_status: presence&.status || {},
        mavlink_component_id: device.mavlink_component_id,
        mavlink_system_id: device.mavlink_system_id
      )
      WifiProfileRecord.where(embedded_device_id: device.id).update_all(assembly_id: device.assembly_id)
      WifiUploadRecord.where(embedded_device_id: device.id).update_all(assembly_id: device.assembly_id)
    end
  end

  def technical_assembly_ids
    profile_ids = WifiProfileRecord.distinct.pluck(:assembly_id)
    upload_ids = WifiUploadRecord.distinct.pluck(:assembly_id)
    field_ids = AssemblyRecord.find_each.filter_map do |assembly|
      assembly.id if TECHNICAL_COLUMNS.any? { |column| assembly.public_send(column).present? }
    end
    (profile_ids + upload_ids + field_ids + composed_fdr_assembly_ids).compact.uniq
  end

  def composed_fdr_assembly_ids
    select_values(<<~SQL)
      SELECT parts.assembly_id
      FROM parts
      INNER JOIN functions ON functions.id = parts.function_id
      WHERE parts.assembly_id IS NOT NULL
        AND functions.code IN ('CONTROLLER', 'STORAGE')
      GROUP BY parts.assembly_id
      HAVING COUNT(DISTINCT functions.code) = 2
    SQL
  end

  def reset_records
    [ AssemblyRecord, EmbeddedDeviceRecord, SignalPresenceRecord, WifiProfileRecord, WifiUploadRecord ].each(&:reset_column_information)
  end

  def remove_legacy_wifi_profile_indexes
    remove_index :fdr_wifi_profiles,
      name: "index_fdr_wifi_profiles_on_assembly_id_and_wifi_credential_id",
      if_exists: true
    remove_index :fdr_wifi_profiles,
      name: "index_fdr_wifi_profiles_on_assembly_id_and_position",
      if_exists: true
  end
end
