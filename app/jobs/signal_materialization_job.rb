class SignalMaterializationJob < ApplicationJob
  queue_as :imports
  # Solid Queue uses the primary database, so the job and pending state commit
  # atomically. A failed enqueue must roll back the flight assignment as well.
  self.enqueue_after_transaction_commit = false

  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    session = job.arguments.first
    session.with_lock do
      next if session.materialization_status == "complete"

      session.update!(materialization_status: "failed")
      session.flight.update!(status: "review")
    end
    Rails.logger.error("Signal materialization failed for session #{session.id}: #{error.class}")
  end
  discard_on ActiveJob::DeserializationError

  def perform(session)
    Signal::MaterializeSession.new(session).call
  end
end
