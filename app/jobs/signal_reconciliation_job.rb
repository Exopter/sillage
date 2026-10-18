class SignalReconciliationJob < ApplicationJob
  queue_as :imports
  discard_on ActiveJob::DeserializationError

  def perform(session)
    return unless session.status == "completed" && session.flight&.waiting_for_recording?

    overlapping = session.user.flights.where("started_at < ? AND ended_at > ?", session.ended_at, session.started_at)
    session.user.flight_imports.where(import_type: "exofdr", status: "imported", target_flight_id: nil,
      id: overlapping.select(:flight_import_id)).find_each do |flight_import|
      Signal::ReconcileRecording.new(flight_import).call
    end
  end
end
