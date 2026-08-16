class ShareWifiCredentialsInHangar < ActiveRecord::Migration[8.1]
  def change
    remove_index :wifi_credentials, %i[user_id ssid]
    rename_column :wifi_credentials, :user_id, :created_by_id
    add_index :wifi_credentials, :ssid, unique: true
  end
end
