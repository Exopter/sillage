class SignalSessionsController < ApplicationController
  def draft
    flight = Current.user.flights.create!(name: "Draft flight", status: "preparation")
    redirect_to signal_path(view: "home"), notice: "Draft #{flight.code} created."
  end

  def create
    signal_session = Signal::StartSession.new(
      user: Current.user,
      flight_id: params[:flight_id],
      station_metadata: { "source" => "web_serial" }
    ).call
    redirect_to signal_path(session: signal_session.uuid), notice: "Signal session started."
  rescue Signal::StartSession::InvalidFlight => error
    redirect_to signal_path(view: "home"), alert: error.message
  end
end
