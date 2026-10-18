class AddFdrImportQueue < ActiveRecord::Migration[8.1]
  def change
    create_table :fdr_import_commands do |t|
      t.references :embedded_controller, null: false, foreign_key: true
      t.references :requested_by, null: false, foreign_key: { to_table: :users }
      t.bigint :recorder_boot_id, null: false
      t.integer :action, null: false
      t.integer :file_index, null: false, default: 0
      t.bigint :file_boot_id, null: false, default: 0
      t.string :status, null: false, default: "pending"
      t.integer :result
      t.datetime :expires_at, null: false
      t.datetime :acknowledged_at
      t.timestamps
    end
    add_column :fdr_wifi_uploads, :priority, :boolean, null: false, default: false
  end
end
