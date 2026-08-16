class AddSillageHeartbeatToAssemblies < ActiveRecord::Migration[8.1]
  def change
    add_column :assemblies, :fdr_auth_key_ciphertext, :text
    add_column :assemblies, :last_sillage_seen_at, :datetime
    add_column :assemblies, :last_sillage_status, :json, default: {}, null: false
    add_index :assemblies, :last_sillage_seen_at
  end
end
