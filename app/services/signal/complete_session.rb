module Signal
  class CompleteSession
    InvalidDecision = Class.new(StandardError)
    def initialize(signal_session:, disposition:, name: nil, ended_at: Time.current)
      @session = signal_session
      @disposition = disposition
      @name = name.to_s.strip.presence || "Signal flight"
      @ended_at = ended_at
    end

    def call
      @session.with_lock do
        return if @session.status == "discarded" && @disposition == "discard"
        raise InvalidDecision, "This session was discarded." if @session.status == "discarded"
        if @disposition == "discard"
          raise InvalidDecision, "A session attached to a flight cannot be discarded here." if @session.flight

          @session.signal_batches.delete_all
          @session.operator_events.delete_all
          @session.raw_capture.purge_later if @session.raw_capture.attached?
          @session.update!(status: "discarded", ended_at: @session.ended_at || @ended_at, station_metadata: {})
          return
        end
        unless @disposition == "save" || (@session.flight && @disposition.blank?)
          raise InvalidDecision, "Choose Save as new flight or Discard."
        end

        create_flight if @session.flight.nil?
        @session.complete!(ended_at: @ended_at)
        @session.flight
      end
      SignalReconciliationJob.perform_later(@session) if @session.status == "completed" && @session.flight&.waiting_for_recording?
      @session.flight
    end

    private

    def create_flight
      flight = @session.user.flights.create!(name: @name, status: "live", started_at: @session.started_at)
      @session.update!(flight:)
      @session.signal_batches.find_each do |batch|
        IngestBatch.new(signal_session: @session, sequence: batch.sequence, payload: batch.payload).materialize!(update_counts: false)
      end
      flight.update!(sample_count: flight.track_points.count, sensor_sample_count: flight.sensor_samples.count)
      @session.operator_events.update_all(flight_id: flight.id)
      IdentifySource.new(signal_session: @session, system_id: @session.mavlink_system_id,
        component_id: @session.mavlink_component_id).call
      # A retained, already completed session can be saved later without changing its end time.
      flight.update!(status: "waiting_for_recording", ended_at: @session.ended_at) if @session.status == "completed"
    end
  end
end
