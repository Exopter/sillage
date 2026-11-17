# One screen for the ground station: standby (link open, live preview, nothing
# recorded), recording, and a watch view for every other device.
class SignalController < ApplicationController
  STATION_COOKIE = :signal_station_flight
  ENVIRONMENT_COOKIE = :signal_environment

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
    @environment = signal_environment
    # A phone cannot hold the ground radio: it opens on the remote and the live view instead of the station.
    return render_phone_hub(live) if phone_hub?

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
  end

  private

  # Signal Tunnel or Signal Sky. A recording follows its flight; standby follows
  # the last choice made on this computer, then the operator's latest flight.
  def signal_environment
    recorded = @active_session&.flight&.environment || @active_session&.station_metadata&.dig("environment")
    return recorded if recorded.in?(Flight::ENVIRONMENTS)

    chosen = params[:environment].presence_in(Flight::ENVIRONMENTS)
    cookies.permanent[ENVIRONMENT_COOKIE] = { value: chosen, httponly: true, same_site: :lax } if chosen
    chosen || cookies[ENVIRONMENT_COOKIE].presence_in(Flight::ENVIRONMENTS) || Current.user.flights.order(:id).last&.environment || "sky"
  end

  def phone_hub?
    request.user_agent.to_s.match?(/Mobi|Android/) && params[:setup] != "1" && params[:watch] != "1" && params[:join] != "1" && params[:session].blank?
  end

  def render_phone_hub(live)
    remote = Flight.visible_to(Current.user).where.not(remote_start_requested_at: nil)
    @hub_live = live
    # A flight started from a remote is running from the tap on Start, before the ground station joins.
    @hub_flight = live&.flight || remote.where(status: "preparation", remote_start_requested_at: RemoteController::START_REQUEST_VALIDITY.ago..).order(:remote_start_requested_at).last
    @hub_station = SignalStation.for_remote(Current.user)
    today = remote.where(remote_start_requested_at: Time.current.beginning_of_day..).where.not(status: "preparation")
    @hub_flights_today = today.count
    @hub_last_flight = today.includes(:pilot).order(:remote_start_requested_at).last
    render :phone
  end

  def recording_here?(session)
    cookies.signed[STATION_COOKIE] == session.uuid
  end
end
