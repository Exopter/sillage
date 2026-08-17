class SignalController < ApplicationController
  def index
    @preparation_flights = Current.user.flights.where(status: "preparation").includes(:aircraft).recent
    @active_session = if params[:session].present?
      Current.user.signal_sessions.includes(flight: :aircraft).find_by!(uuid: params[:session])
    else
      Current.user.signal_sessions.where(status: %w[live syncing]).includes(flight: :aircraft).recent.first
    end
    @selected_flight = Current.user.flights.find_by(id: params[:flight_id])
    @fdr_wifi_recorder = resolve_fdr_wifi_recorder
  end

  private

  def resolve_fdr_wifi_recorder
    aircraft = @selected_flight&.aircraft || @active_session&.flight&.aircraft
    installed_recorder = aircraft&.installations&.active&.includes(:installable)&.filter_map(&:installable)&.find do |asset|
      asset.is_a?(Assembly) && asset.flight_data_recorder?
    end
    return installed_recorder if installed_recorder

    recorders = Assembly.ordered.select(&:flight_data_recorder?)
    recorders.one? ? recorders.first : nil
  end
end
