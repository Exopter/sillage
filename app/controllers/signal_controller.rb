class SignalController < ApplicationController
  def index
    @preparation_flights = Current.user.flights.where(status: "preparation").includes(:aircraft, :landing_zone).recent
    @active_session = if params[:session].present?
      Current.user.signal_sessions.includes(flight: %i[aircraft landing_zone]).find_by!(uuid: params[:session])
    else
      Current.user.signal_sessions.where(status: %w[live syncing]).includes(flight: %i[aircraft landing_zone]).recent.first
    end
    @selected_flight = Current.user.flights.find_by(id: params[:flight_id])
    @map_style_url = ENV["MAPLIBRE_STYLE_URL"].presence
  end
end
