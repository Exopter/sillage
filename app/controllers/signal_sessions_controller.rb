class SignalSessionsController < ApplicationController
  def draft
    flight = Current.user.flights.create!(name: "Draft flight", status: "preparation")
    redirect_to signal_path(view: "home"), notice: "Draft #{flight.code} created."
  end

  def retry_processing
    session = SignalSession.accessible_to(Current.user).find_by!(uuid: params[:id])
    unless session.status == "completed" && session.flight && session.materialization_status != "complete"
      redirect_to signal_path(view: "home"), alert: "This session does not need processing."
      return
    end

    Signal::CompleteSession.new(signal_session: session, disposition: "save").call
    redirect_to flight_path(session.flight), notice: "Flight processing resumed. Your recording is saved."
  end

  def create
    signal_session = Signal::StartSession.new(
      user: Current.user,
      device_id: params[:device_id],
      flight_id: params[:flight_id],
      station_metadata: { "source" => "web_serial" }
    ).call
    redirect_to signal_path(session: signal_session.uuid, station: params[:station].presence), notice: "Signal session started."
  rescue Signal::StartSession::InvalidFlight, Signal::RecorderAccess::Denied => error
    redirect_to signal_path(view: "home", station: params[:station].presence), alert: error.message
  end
end
