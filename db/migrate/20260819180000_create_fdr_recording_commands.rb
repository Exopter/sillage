class CreateFdrRecordingCommands < ActiveRecord::Migration[8.1]
  def change
    create_table :fdr_recording_commands do |t|
      t.references :embedded_device, null: false, foreign_key: true
      t.references :requested_by, null: false, foreign_key: { to_table: :users }
      t.boolean :requested_enabled, null: false
      t.string :status, null: false, default: "pending"
      t.integer :result
      t.datetime :acknowledged_at

      t.timestamps
    end

    add_index :fdr_recording_commands, %i[embedded_device_id status]
  end
end
