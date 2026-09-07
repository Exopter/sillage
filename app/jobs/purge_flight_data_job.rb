class PurgeFlightDataJob < ApplicationJob
  queue_as :default
  # Production Solid Queue commits this job with the deletion transaction.
  # Development's in-process worker must wait until attachments are detached.
  self.enqueue_after_transaction_commit = Rails.env.development?

  retry_on IOError, SystemCallError, wait: :polynomially_longer, attempts: 5

  def perform(blob_ids)
    ActiveStorage::Blob.where(id: blob_ids).find_each do |blob|
      blob.with_lock do
        next if blob.attachments.exists?
        next if TrackPoint.where(source_blob_id: blob.id).exists? || SensorSample.where(source_blob_id: blob.id).exists?

        # Keep the blob metadata if storage deletion fails so a retry still
        # knows the object key. Foreign keys protect newly shared sources.
        blob.destroy!
        blob.delete
      end
    rescue ActiveRecord::RecordNotFound, ActiveRecord::InvalidForeignKey
      next
    end
  end
end
