class FlightsController < ApplicationController
  include Pagination
  include FlightBrowser

  before_action :set_flight, only: [ :show, :edit, :update, :destroy ]
  before_action :disable_caching

  def index
    if params[:recording].present?
      @flight_import = FlightImport.accessible_to(Current.user).find(params[:recording])
      @recording_flights = @flight_import.flights.recent
      if @flight_import.imported? && !@flight_import.set_aside? && @recording_flights.one?
        redirect_to @recording_flights.first
        return
      end
    end
    load_browser
  end

  def preview
    load_browser_context
    @selected_entry = if params[:kind] == "import"
      FlightImport.accessible_to(Current.user).find(params[:id])
    else
      Flight.visible_to(Current.user).includes(:aircraft, :fdr, folder: :memberships).find(params[:id])
    end
    @destination_folders = FlightFolder.contributable_to(Current.user).ordered
    @preview_points = Flights::RoutePreview.call(@selected_entry)
    render partial: "flights/browser_preview", locals: { entry: @selected_entry }
  end

  def new
    @flight = Current.user.flights.new(status: "logged", flown_on: Date.current)
    load_browser(panel: "new")
    @flight.folder = @folder if @folder&.contributable_by?(Current.user)
    load_form_options
  end

  def create
    attributes = flight_params
    prepare_manual_location(attributes)
    @flight = Current.user.flights.new(attributes.merge(status: "logged"))

    if @flight.save(context: :logbook)
      @flight.capture_configuration!
      redirect_to flight_path(@flight, **(params[:return_to_browser] == "1" ? browser_return_parameters : {})), notice: "Flight logged."
    else
      load_browser(panel: "new")
      load_form_options
      render :new, status: :unprocessable_entity
    end
  end

  def edit
    load_browser(panel: "edit", focus: @flight)
    load_form_options
  end

  def show
    load_form_options
    if @flight.logbook_view?
      load_browser(panel: "preparation", focus: @flight)
      render :preparation
      return
    end

    # Authorize on every request; cache only derived telemetry, never permissions or HTML.
    @telemetry_version = Flights::ProcessedTrack.version(@flight)
    payload = Rails.cache.fetch([ "flight-replay-quality", Flights::TrackQuality::VERSION, @flight.cache_key_with_version, @telemetry_version ], expires_in: 30.minutes) { replay_payload }
    @sensor_counts, @flight_analysis, @analysis, @visualization_points, @visualization_sensors, @bounds, @track_quality = payload
    @cesium_ion_token = cesium_ion_token
    @radio_histories = Signal::RadioHistory.for_flight(@flight)
    @radio_signal = Signal::RadioHistory.ground_signal_for(@flight, histories: @radio_histories)
    @imu_quality_events = @flight.operator_events.where("metadata ->> 'source' = ?", "imu_health").order(occurred_at: :desc, id: :desc).to_a
    @imu_checks = @flight.imu_checks.recent.limit(10).to_a
  end

  def update
    attributes = flight_params
    prepare_manual_location(attributes, current_location: @flight.location)
    video_upload = attributes.delete(:video_upload)

    if video_upload.present? && !video_upload?(video_upload)
      respond_to_upload_failure(t(".video_invalid"))
      return
    end

    @flight.flown_on ||= @flight.display_flown_on if attributes.key?(:location) && !attributes.key?(:flown_on)
    @flight.folder_assignment_user = Current.user
    @flight.assign_attributes(attributes)
    context = attributes.key?(:flown_on) || attributes.key?(:location) ? :logbook : nil
    if @flight.save(context:)
      @flight.capture_configuration!(replace: true) if @flight.saved_change_to_aircraft_id?
      enqueue_video_processing(video_upload) if video_upload.present?
      destination = if !@flight.visible_to?(Current.user)
        flights_path(**browser_return_parameters)
      elsif params[:return_to_browser] == "1"
        flights_path(**browser_return_parameters, selected: "flight:#{@flight.id}")
      else
        flight_path(@flight)
      end
      respond_to_upload_success(destination, t(".success"))
    else
      respond_to_upload_failure(@flight.errors.full_messages.to_sentence)
    end
  end

  def destroy
    Flights::DeleteRecording.new(flight: @flight).call
    redirect_to flights_path, notice: t(".success")
  rescue ActiveJob::EnqueueError
    redirect_to @flight, alert: "The flight could not be deleted. Please try again."
  end

  def bulk_destroy
    count = Flights::DeleteSelection.new(user: Current.user, entries: params[:entries]).call
    redirect_to selection_return_path, status: :see_other, notice: "#{count} #{'entry'.pluralize(count)} deleted."
  rescue Flights::DeleteSelection::InvalidSelection => error
    redirect_to selection_return_path, status: :see_other, alert: error.message
  rescue ActiveJob::EnqueueError
    redirect_to selection_return_path, status: :see_other, alert: "The selection could not be deleted. Please try again."
  end

  def bulk_action
    return bulk_destroy if params[:operation] == "delete"
    unless params[:operation] == "move"
      redirect_to selection_return_path, status: :see_other, alert: "Choose a selection action."
      return
    end

    count = Flights::MoveSelection.new(user: Current.user, entries: params[:entries], folder_id: params[:destination_folder_id]).call
    redirect_to selection_return_path, status: :see_other, notice: "#{count} #{'flight'.pluralize(count)} moved."
  rescue Flights::MoveSelection::InvalidSelection => error
    redirect_to selection_return_path, status: :see_other, alert: error.message
  end

  private

  def replay_payload
    processed = Flights::ProcessedTrack.call(@flight, version: @telemetry_version)
    analysis = processed.fetch(:analysis)
    boundaries = analysis.bounds.values.compact.map { |timestamp| @flight.started_at && timestamp - @flight.started_at }
    points = Flights::SampleTrack.call(processed.fetch(:points), limit: 2_000, boundaries: boundaries)
    counts = @flight.sensor_samples.group(:sensor_type).count
    sensors = Flights::SampleSensors.call(@flight, limit_per_type: 1_200, counts:)
    @ground_altitude_m = analysis.altitude_min
    [ counts, analysis, analysis_payload(analysis), points.map { |point| serialize_point(point) },
      sensors.map { |sample| serialize_sensor_sample(sample) }, bounds_payload(analysis.bounds), processed.fetch(:quality) ]
  end

  def selection_return_path
    flights_path(filter: params[:filter].presence_in(Flights::Logbook::FILTERS) || "flights",
      q: params[:q].to_s.strip.presence, visibility: params[:visibility].presence_in(Flight::EFFECTIVE_VISIBILITIES), folder: params[:folder].presence)
  end

  def set_flight
    @flight = Flight.visible_to(Current.user).includes(:aircraft, :fdr, folder: :memberships).find(params[:id])
  end

  def disable_caching
    no_store
  end

  def cesium_ion_token
    ENV["CESIUM_ION_TOKEN"].presence ||
      Rails.application.credentials.dig(:cesium, :ion_token).presence
  end

  def flight_params
    params.require(:flight).permit(
      :name,
      :description,
      :flown_on,
      :flown_at,
      :fdr_id,
      :visibility,
      :folder_id,
      :location,
      :aircraft_id,
      :initial_comment,
      :exit_at,
      :opening_at,
      :landing_at,
      :video_upload,
      :video_exit_offset_seconds
    )
  end

  def load_form_options
    @form_folders = FlightFolder.contributable_to(Current.user).ordered
    if @flight&.visible_to?(Current.user) && @flight.folder_id_in_database
      @form_folders = @form_folders.or(FlightFolder.where(id: @flight.folder_id_in_database).ordered)
    end
    available_aircraft = Aircraft.active
    available_aircraft = available_aircraft.or(Aircraft.where(id: @flight.aircraft_id)) if @flight&.aircraft_id
    @aircraft = available_aircraft.ordered
    available_fdrs = Assembly.where(assembly_type: "ExoFDR").not_retired
    available_fdrs = available_fdrs.or(Assembly.where(id: @flight.fdr_id)) if @flight&.fdr_id
    @fdrs = available_fdrs.order(:serial_number)
  end

  def prepare_manual_location(attributes, current_location: nil)
    return unless attributes.key?(:location)

    location = attributes[:location].to_s.strip.presence
    attributes[:location] = location
    attributes[:location_source] = location ? "manual" : nil if location != current_location
  end

  def video_upload?(upload)
    upload.content_type&.start_with?("video/") ||
      Flight::VIDEO_UPLOAD_EXTENSIONS.include?(File.extname(upload.original_filename.to_s).downcase)
  end

  def enqueue_video_processing(video_upload)
    blob = ActiveStorage::Blob.create_and_upload!(
      io: video_upload, filename: video_upload.original_filename, content_type: video_upload.content_type
    )
    @flight.with_lock do
      @flight.video_upload.attach(blob)
      @flight.update!(video_processing_status: "processing", video_processing_error: nil)
      raise ActiveJob::EnqueueError, "The video could not be queued." unless FlightVideoProcessingJob.perform_later(@flight, blob)
    end
  rescue StandardError
    blob&.purge unless blob&.attachments&.exists?
    raise
  end

  def respond_to_upload_success(redirect_url, notice)
    if request.format.json?
      flash[:notice] = notice
      render json: { redirect_url: redirect_url }, status: :ok
    else
      redirect_to(redirect_url, notice: notice)
    end
  end

  def respond_to_upload_failure(message)
    if request.format.json?
      render json: { error: message }, status: :unprocessable_entity
    elsif params[:return_to_browser] == "1"
      @flight.errors.add(:base, message) if @flight.errors.empty?
      load_browser(panel: "edit")
      load_form_options
      render :edit, status: :unprocessable_entity
    else
      redirect_to(@flight, alert: message)
    end
  end

  def serialize_point(point)
    {
      t: point[:elapsed_seconds]&.round(3),
      lat: point[:lat],
      lon: point[:lon],
      alt: point[:altitude_m],
      height: height_from_ground(point[:altitude_m]),
      hspeed: point[:horizontal_speed_mps],
      vspeed: point[:vertical_speed_mps],
      glide: point[:glide_ratio],
      distance: point[:distance_from_start_m],
      segment: point[:segment]
    }
  end

  def serialize_sensor_sample(sample)
    readings = sample.installed_readings
    if sample.sensor_type == "BARO" && readings["pressure_altitude_m"].blank?
      readings = readings.merge("pressure_altitude_m" => Flights::PressureAltitude.from_pascals(readings["pressure"]))
    end

    {
      type: sample.sensor_type,
      t: sensor_elapsed_seconds(sample)&.round(3),
      readings: readings
    }
  end

  def height_from_ground(altitude)
    return nil unless altitude && @ground_altitude_m

    [ altitude.to_f - @ground_altitude_m.to_f, 0.0 ].max
  end

  def sensor_elapsed_seconds(sample)
    return sample.recorded_at - @flight.started_at if sample.recorded_at && @flight.started_at

    sample.elapsed_seconds
  end

  def analysis_payload(analysis)
    analysis.to_h.except(:bounds).merge(
      timeline_start: analysis.timeline_start&.round(3),
      timeline_end: analysis.timeline_end&.round(3),
      replay_start: analysis.replay_start&.round(3),
      replay_end: analysis.replay_end&.round(3),
      altitude_min: analysis.altitude_min&.round(3),
      altitude_max: analysis.altitude_max&.round(3)
    )
  end

  def bounds_payload(bounds)
    {
      exit: elapsed_for(bounds[:exit_at]),
      opening: elapsed_for(bounds[:opening_at]),
      landing: elapsed_for(bounds[:landing_at])
    }.compact
  end

  def elapsed_for(timestamp)
    return nil unless timestamp && @flight.started_at

    (timestamp - @flight.started_at).round(3)
  end
end
