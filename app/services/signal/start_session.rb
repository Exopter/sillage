module Signal
  class StartSession
    def initialize(user:, flight_id: nil, uuid: nil, started_at: nil, station_metadata: {},
      mavlink_system_id: nil, mavlink_component_id: nil)
      @user = user
      @flight_id = flight_id
      @uuid = uuid.presence
      @started_at = started_at || Time.current
      @station_metadata = station_metadata.to_h
      @mavlink_system_id = mavlink_system_id
      @mavlink_component_id = mavlink_component_id
    end

    def call
      existing = @user.signal_sessions.find_by(uuid: @uuid) if @uuid
      return existing if existing

      SignalSession.transaction do
        flight = prepare_flight
        session = @user.signal_sessions.create!(
          uuid: @uuid,
          flight:,
          started_at: @started_at,
          station_metadata: @station_metadata
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
      flight = if @flight_id.present?
        @user.flights.find(@flight_id)
      else
        @user.flights.create!(name: "Live flight", status: "live", started_at: @started_at)
      end
      flight.update!(status: "live", started_at: flight.started_at || @started_at)
      flight.capture_configuration!
      flight
    end
  end
end
