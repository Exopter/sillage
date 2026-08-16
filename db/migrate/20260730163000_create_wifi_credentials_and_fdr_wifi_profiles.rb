class CreateWifiCredentialsAndFdrWifiProfiles < ActiveRecord::Migration[8.1]
  def change
    create_table :wifi_credentials do |t|
      t.references :user, null: false, foreign_key: true
      t.string :ssid, null: false
      t.string :security, null: false
      t.text :password_ciphertext, null: false
      t.datetime :last_used_at

      t.timestamps
    end
    add_index :wifi_credentials, %i[user_id ssid], unique: true

    create_table :fdr_wifi_profiles do |t|
      t.references :assembly, null: false, foreign_key: true
      t.references :wifi_credential, null: false, foreign_key: true
      t.integer :position, null: false
      t.boolean :enabled, null: false, default: true
      t.datetime :last_provisioned_at
      t.string :last_provisioned_device_id

      t.timestamps
    end
    add_index :fdr_wifi_profiles, %i[assembly_id wifi_credential_id], unique: true
    add_index :fdr_wifi_profiles, %i[assembly_id position], unique: true
  end
end
