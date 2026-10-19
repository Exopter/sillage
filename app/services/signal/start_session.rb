module Signal
  class StartSession
    InvalidFlight = Class.new(StandardError)

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
      existing = SignalSession.accessible_to(@user).find_by(uuid: @uuid) if @uuid
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
      return if @flight_id.blank?

      flight = Flight.visible_to(@user).find(@flight_id)
      unless flight.preparation? || flight.live? || (flight.logged? && flight.fdr_id.present?)
        raise InvalidFlight, "Only a draft or live flight can receive a Signal session."
      end
      flight.update!(status: "live", started_at: flight.started_at || @started_at)
      flight.capture_configuration!(at: nil)
      flight
    end
  end
end
