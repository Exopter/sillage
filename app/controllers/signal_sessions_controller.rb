class SignalSessionsController < ApplicationController
  def retry_processing
    session = SignalSession.accessible_to(Current.user).find_by!(uuid: params[:id])
    unless session.status == "completed" && session.flight && session.materialization_status != "complete"
      redirect_to signal_path(view: "home"), alert: "This flight does not need processing."
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
      environment: params[:environment],
      tunnel_glide_ratio: params[:tunnel_glide_ratio],
      station_metadata: { "source" => "web_serial", "flight_trigger" => params[:flight_trigger].presence_in(%w[signal power]), "transport" => params[:transport].to_s.presence }.compact
    ).call
    # This computer records the flight; every other device opening Signal watches it.
    cookies.signed[SignalController::STATION_COOKIE] = { value: signal_session.uuid, httponly: true, same_site: :lax, expires: 2.days }
    redirect_to signal_path(session: signal_session.uuid), status: :see_other
  rescue Signal::StartSession::InvalidFlight, Signal::RecorderAccess::Denied => error
    redirect_to signal_path(view: "home"), alert: error.message, status: :see_other
  end
end
