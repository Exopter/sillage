class SignalController < ApplicationController
  def index
    @preparation_flights = Current.user.flights.where(status: "preparation").includes(:aircraft).recent
    @active_session = if params[:session].present?
      Current.user.signal_sessions.includes(flight: :aircraft).find_by!(uuid: params[:session])
    else
      Current.user.signal_sessions.where(status: %w[live syncing]).includes(flight: :aircraft).recent.first
    end
    @selected_flight = Current.user.flights.find_by(id: params[:flight_id])
  end
end
