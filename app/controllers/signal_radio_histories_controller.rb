class SignalRadioHistoriesController < ApplicationController
  def show
    no_store
    visible = SignalSession.where(user: Current.user).or(SignalSession.where(flight_id: Flight.visible_to(Current.user).select(:id)))
    @signal_session = visible.where.not(status: "discarded").find_by!(uuid: params[:signal_session_id])
    history = Signal::RadioHistory.new(@signal_session)
    @rows = history.rows
    @duration = history.duration
    respond_to do |format|
      format.html
      format.csv { send_data history.to_csv, filename: "signal-#{@signal_session.uuid}-radio.csv", type: "text/csv" }
    end
  end
end
