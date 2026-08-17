class SignalSessionsController < ApplicationController
  def create
    flight = if params[:flight_id].present?
      Current.user.flights.find(params[:flight_id])
    else
      Current.user.flights.create!(
        name: "Live flight",
        status: "live",
        started_at: Time.current
      )
    end
    flight.update!(status: "live", started_at: flight.started_at || Time.current)
    flight.capture_configuration!

    signal_session = Current.user.signal_sessions.create!(
      flight:,
      station_metadata: { "source" => "web_serial" }
    )
    redirect_to signal_path(session: signal_session.uuid), notice: "Signal session started."
  end
end
