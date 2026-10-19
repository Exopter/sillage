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
        if @session.materialization_status != "complete"
          @session.flight.update!(status: "processing")
          @session.update!(materialization_status: "pending")
          job = SignalMaterializationJob.perform_later(@session)
          raise ActiveJob::EnqueueError, "Could not enqueue Signal processing" unless job
        end
        @session.flight
      end
      SignalReconciliationJob.perform_later(@session) if @session.status == "completed" && @session.materialization_status == "complete" && @session.flight&.waiting_for_recording?
      @session.flight
    end

    private

    def create_flight
      flight = @session.user.flights.create!(name: @name, status: "live", started_at: @session.started_at)
      @session.update!(flight:, materialization_status: "pending")
      @session.operator_events.update_all(flight_id: flight.id)
      IdentifySource.new(signal_session: @session, system_id: @session.mavlink_system_id,
        component_id: @session.mavlink_component_id).call
    end
  end
end
