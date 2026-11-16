# One screen for the ground station: standby (link open, live preview, nothing
# recorded), recording, and a watch view for every other device.
class SignalController < ApplicationController
  STATION_COOKIE = :signal_station_flight

  def index
    no_store
    live = SignalSession.accessible_to(Current.user).where(status: %w[live syncing]).includes(flight: :aircraft).recent.first
    @active_session = if params[:session].present?
      SignalSession.accessible_to(Current.user).includes(flight: :aircraft).find_by!(uuid: params[:session])
    elsif params[:view] != "home"
      live
    end
    if @active_session&.status == "discarded"
      redirect_to signal_path(view: "home")
      return
    end
    unless can_manage_operations?
      @read_only_sessions = SignalSession.accessible_to(Current.user).where.not(status: "discarded").includes(:flight).recent.limit(50)
      return render :read_only
    end
    # Only the computer that started the flight records it. Any other device watches.
    if @active_session && (params[:watch] == "1" || params[:join] == "1" || (params[:session].blank? && !recording_here?(@active_session)))
      return render :watch
    end

    @cesium_ion_token = ENV["CESIUM_ION_TOKEN"].presence || Rails.application.credentials.dig(:cesium, :ion_token).presence
    @live_recorders = EmbeddedController.order(:device_id)
    @imu_mount_profiles = EmbeddedController.where.not(device_id: nil).includes(part: :assembly).to_h { |controller| [ controller.device_id, controller.imu_mount_profile ] }
    return if @active_session

    @live_elsewhere = live
    @interrupted_sessions = SignalSession.accessible_to(Current.user).where(flight_id: nil).where.not(status: "discarded").recent
    @prepared_flights = Flight.visible_to(Current.user).where(status: "preparation").or(Flight.visible_to(Current.user).where(status: "logged").where.not(fdr_id: nil)).includes(:aircraft).recent
    @selected_flight = @prepared_flights.find { |flight| flight.id == params[:flight_id].to_i }
    @assignment_configurations = FdrFunctionalConfiguration.ordered
    @assignable_assemblies = Assembly.not_retired.connectable_fdrs.includes(:fdr_functional_configuration,
      active_fdr_board_installation: :embedded_controller).ordered.reject(&:embedded_controller)
    @remote_qr = remote_qr
  end

  private

  def recording_here?(session)
    cookies.signed[STATION_COOKIE] == session.uuid
  end

  def remote_qr
    svg = RQRCode::QRCode.new(remote_url).as_svg(color: "000", shape_rendering: "crispEdges", module_size: 5, standalone: true, use_path: true)
    "data:image/svg+xml;base64,#{Base64.strict_encode64(svg)}"
  end
end
