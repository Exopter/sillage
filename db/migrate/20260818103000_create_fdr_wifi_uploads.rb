class CreateFdrWifiUploads < ActiveRecord::Migration[8.1]
  def change
    create_table :fdr_wifi_uploads do |t|
      t.references :assembly, null: false, foreign_key: true
      t.references :flight_import, foreign_key: true
      t.string :token, null: false
      t.string :status, null: false, default: "receiving"
      t.string :filename, null: false
      t.integer :file_index, null: false
      t.integer :boot_id, null: false
      t.integer :format_version, null: false
      t.integer :size_bytes, null: false
      t.string :sha256, null: false
      t.integer :received_bytes, null: false, default: 0
      t.text :error_message
      t.datetime :completed_at

      t.timestamps
    end

    add_index :fdr_wifi_uploads, :token, unique: true
    add_index :fdr_wifi_uploads,
      %i[assembly_id boot_id file_index],
      unique: true,
      name: "index_fdr_wifi_uploads_on_recorder_file"
  end
end
