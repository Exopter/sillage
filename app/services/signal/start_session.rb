module Signal
  class StartSession
    InvalidFlight = Class.new(StandardError)

    def initialize(user:, flight_id: nil, uuid: nil, started_at: nil, station_metadata: {},
      mavlink_system_id: nil, mavlink_component_id: nil, device_id: nil)
      @device_id = device_id
      @user = user
      @flight_id = flight_id
      @uuid = uuid.presence
      @started_at = started_at || Time.current
      @station_metadata = station_metadata.to_h
      @mavlink_system_id = mavlink_system_id
      @mavlink_component_id = mavlink_component_id
    end

    def call
      @recorder = RecorderAccess.resolve!(@device_id)
      @assembly = @recorder.assembly
      existing = SignalSession.accessible_to(@user).find_by(uuid: @uuid) if @uuid
      if existing
        RecorderAccess.for_session!(existing, device_id: @recorder.device_id)
        return existing
      end

      SignalSession.transaction do
        # Serialize starts across all application processes for this Sillage instance.
        SignalSession.connection.execute("SELECT pg_advisory_xact_lock(741253901)")
        active = SignalSession.where(status: %w[live syncing]).first
        if active
          if @flight_id.present? && active.flight_id != @flight_id.to_i
            raise InvalidFlight, "Another flight is already live. Join it or end it before starting this flight."
          end
          raise InvalidFlight, "A flight is already live." unless SignalSession.accessible_to(@user).exists?(active.id)
          RecorderAccess.for_session!(active, device_id: @recorder.device_id)
          return active
        end
        flight = prepare_flight
        session = @user.signal_sessions.create!(
          uuid: @uuid,
          flight:,
          started_at: @started_at,
          station_metadata: @station_metadata.merge("recorder_device_id" => @recorder.device_id,
            "recorder_assembly_id" => @assembly&.id)
        )
        IdentifySource.new(
          signal_session: session,
          system_id: @mavlink_system_id,
          component_id: @mavlink_component_id
        ).call
        session
      end
    end

    private

    def prepare_flight
      if @flight_id.blank?
        return @user.flights.create!(status: "live", started_at: @started_at,
          fdr: @assembly&.fdr_system_at || @assembly, aircraft: @recorder.aircraft).tap do |flight|
          flight.capture_configuration!(at: nil)
        end
      end

      flight = Flight.visible_to(@user).find(@flight_id)
      unless flight.preparation? || flight.live? || (flight.logged? && flight.fdr_id.present?)
        raise InvalidFlight, "Only a draft or live flight can receive a Signal session."
      end
      owner = @assembly&.fdr_system_at || @assembly
      if flight.fdr_id && owner && ![ @assembly.id, owner.id ].include?(flight.fdr_id)
        raise RecorderAccess::Denied, "The connected recorder does not match the flight assembly."
      end
      if flight.aircraft && @recorder.aircraft && flight.aircraft != @recorder.aircraft
        raise RecorderAccess::Denied, "The connected recorder is installed on a different aircraft."
      end
      flight.fdr ||= owner
      flight.update!(status: "live", started_at: flight.started_at || @started_at)
      flight.capture_configuration!(at: nil)
      flight
    end
  end
end
