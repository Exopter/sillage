class SignalController < ApplicationController
  def index
    no_store
    @cesium_ion_token = ENV["CESIUM_ION_TOKEN"].presence || Rails.application.credentials.dig(:cesium, :ion_token).presence
    @live_recorders = EmbeddedController.order(:device_id)
    @preparation_flights = Flight.visible_to(Current.user).where(status: "preparation").or(Flight.visible_to(Current.user).where(status: "logged").where.not(fdr_id: nil)).includes(:aircraft).recent
    @active_session = if params[:session].present?
      SignalSession.accessible_to(Current.user).includes(flight: :aircraft).find_by!(uuid: params[:session])
    elsif params[:view] != "home"
      SignalSession.accessible_to(Current.user).where(user: Current.user, status: %w[live syncing]).includes(flight: :aircraft).recent.first
    end
    if @active_session&.status == "discarded"
      redirect_to signal_path(view: "home")
      return
    end
    @retained_sessions = SignalSession.accessible_to(Current.user).where(flight_id: nil).where.not(status: "discarded").recent
    @completed_sessions = SignalSession.accessible_to(Current.user).where(status: "completed").where.not(flight_id: nil).includes(:flight).recent.limit(20)
    @selected_flight = Flight.visible_to(Current.user).find_by(id: params[:flight_id])
    unless can_manage_operations?
      @read_only_sessions = SignalSession.accessible_to(Current.user).where.not(status: "discarded").includes(:flight).recent.limit(50)
      return render :read_only
    end
    @imu_mount_profiles = EmbeddedController.where.not(device_id: nil).includes(part: :assembly).to_h { |controller| [ controller.device_id, controller.imu_mount_profile ] } if @active_session
  end
end
