class SignalController < ApplicationController
  def index
    no_store
    @cesium_ion_token = ENV["CESIUM_ION_TOKEN"].presence || Rails.application.credentials.dig(:cesium, :ion_token).presence
    @preparation_flights = Current.user.flights.where(status: "preparation").includes(:aircraft).recent
    @active_session = if params[:session].present?
      Current.user.signal_sessions.includes(flight: :aircraft).find_by!(uuid: params[:session])
    elsif params[:view] != "home"
      Current.user.signal_sessions.where(status: %w[live syncing]).includes(flight: :aircraft).recent.first
    end
    if @active_session&.status == "discarded"
      redirect_to signal_path(view: "home")
      return
    end
    @retained_sessions = Current.user.signal_sessions.where(flight_id: nil).where.not(status: "discarded").recent
    @selected_flight = Current.user.flights.find_by(id: params[:flight_id])
    @imu_mount_profiles = EmbeddedController.where.not(device_id: nil).includes(part: :assembly).to_h { |controller| [ controller.device_id, controller.imu_mount_profile ] } if @active_session
  end
end
