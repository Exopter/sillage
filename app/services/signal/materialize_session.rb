module Signal
  class MaterializeSession
    BATCHES_PER_TRANSACTION = 20

    def initialize(session)
      @session = session
    end

    def call
      loop do
        finished = @session.with_lock do
          next true if @session.materialization_status == "complete"
          raise CompleteSession::InvalidDecision, "Complete the session before processing its samples." unless @session.status == "completed"

          flight = @session.flight
          flight.with_lock do
            # Reconciliation must wait until every retained batch is materialized.
            raise CompleteSession::InvalidDecision, "The flight already has an attached recording." if flight.flight_import_id

            batches = @session.signal_batches.where("id > ?", @session.materialized_batch_id).order(:id).limit(BATCHES_PER_TRANSACTION).to_a
            if batches.empty?
              @session.update!(materialization_status: "complete")
              flight.update!(status: "waiting_for_recording", ended_at: @session.ended_at,
                sample_count: flight.track_points.count, sensor_sample_count: flight.sensor_samples.count)
              job = SignalReconciliationJob.perform_later(@session)
              raise ActiveJob::EnqueueError, "Could not enqueue Signal reconciliation" unless job
              true
            else
              writer = SampleWriter.new
              batches.each do |batch|
                IngestBatch.new(signal_session: @session, sequence: batch.sequence, payload: batch.payload)
                  .materialize!(update_counts: false, writer:)
              end
              writer.flush
              @session.update!(materialization_status: "pending", materialized_batch_id: batches.last.id)
              false
            end
          end
        end
        break if finished
      end
    end
  end
end
