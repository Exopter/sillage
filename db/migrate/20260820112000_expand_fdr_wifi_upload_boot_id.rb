class ExpandFdrWifiUploadBootId < ActiveRecord::Migration[8.1]
  def change
    change_column :fdr_wifi_uploads, :boot_id, :bigint, null: false
  end
end
