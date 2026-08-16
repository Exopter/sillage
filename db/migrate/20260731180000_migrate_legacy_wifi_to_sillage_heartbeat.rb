class MigrateLegacyWifiToSillageHeartbeat < ActiveRecord::Migration[8.1]
  def up
    add_column :assemblies, :fdr_auth_key_ciphertext, :text unless column_exists?(:assemblies, :fdr_auth_key_ciphertext)
    add_column :assemblies, :last_sillage_seen_at, :datetime unless column_exists?(:assemblies, :last_sillage_seen_at)
    add_column :assemblies, :last_sillage_status, :json, default: {}, null: false unless column_exists?(:assemblies, :last_sillage_status)

    if column_exists?(:assemblies, :last_wifi_seen_at)
      execute <<~SQL.squish
        UPDATE assemblies
        SET last_sillage_seen_at = last_wifi_seen_at
        WHERE last_sillage_seen_at IS NULL
      SQL
    end

    if column_exists?(:assemblies, :last_wifi_status)
      execute <<~SQL.squish
        UPDATE assemblies
        SET last_sillage_status = last_wifi_status
        WHERE last_wifi_status IS NOT NULL
      SQL
    end

    add_index :assemblies, :last_sillage_seen_at unless index_exists?(:assemblies, :last_sillage_seen_at)
    remove_column :assemblies, :fdr_presence_token_ciphertext if column_exists?(:assemblies, :fdr_presence_token_ciphertext)
    remove_column :assemblies, :last_wifi_seen_at if column_exists?(:assemblies, :last_wifi_seen_at)
    remove_column :assemblies, :last_wifi_status if column_exists?(:assemblies, :last_wifi_status)
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "The deprecated prototype token cannot be reconstructed from the Sillage authentication key."
  end
end
