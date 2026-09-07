class FdrRecordingActivityJob < ApplicationJob
  queue_as :imports
  self.enqueue_after_transaction_commit = true

  discard_on ActiveJob::DeserializationError

  def perform(flight_import)
    ExoFdr::RecordingActivity.new(flight_import).reconcile!
  end
end
