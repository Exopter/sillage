class RemoveForgeBuildsAndTestRuns < ActiveRecord::Migration[8.1]
  def up
    # Detach without resolving the retired TestRun model. Shared blobs must survive.
    attachments = ActiveStorage::Attachment.where(record_type: "TestRun")
    blob_ids = attachments.distinct.pluck(:blob_id)
    attachments.delete_all
    ActiveStorage::Blob.where(id: blob_ids).find_each do |blob|
      blob.purge_later unless blob.attachments.exists?
    end

    execute <<~SQL
      DELETE FROM device_activities
      WHERE event_type IN ('build_created', 'build_cloned', 'test_run_synchronized', 'test_run_validated')
    SQL
    execute "DELETE FROM identifier_sequences WHERE name = 'build_code'"
    drop_table :test_runs
    drop_table :builds
    remove_column :users, :bench_token_digest
    remove_column :users, :bench_token_created_at
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Forge builds and test evidence have been permanently removed"
  end
end
