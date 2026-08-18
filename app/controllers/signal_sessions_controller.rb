class SignalSessionsController < ApplicationController
  def create
    signal_session = Signal::StartSession.new(
      user: Current.user,
      flight_id: params[:flight_id],
      station_metadata: { "source" => "web_serial" }
    ).call
    redirect_to signal_path(session: signal_session.uuid), notice: "Signal session started."
  end
end
