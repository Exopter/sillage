class PreserveFdrRecordProvenance < ActiveRecord::Migration[8.1]
  def change
    create_table :fdr_recordings do |t|
      t.references :user, null: false, foreign_key: true, index: false
      t.string :recorder_key, null: false
      t.bigint :boot_id, null: false
      t.timestamps
      t.index [ :user_id, :recorder_key, :boot_id ], unique: true
    end

    %i[track_points sensor_samples].each do |table|
      add_reference table, :fdr_recording, foreign_key: true, index: false
      add_column table, :fdr_sequence, :bigint
      add_column table, :fdr_timestamp_us, :bigint
      add_reference table, :source_blob, foreign_key: { to_table: :active_storage_blobs }, index: { where: "source_blob_id IS NOT NULL" }
      add_index table, [ :fdr_recording_id, :fdr_sequence ], unique: true, where: "fdr_recording_id IS NOT NULL"
    end
  end
end
