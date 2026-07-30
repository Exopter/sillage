class FlightImportsController < ApplicationController
  def new
    @aircraft = Aircraft.active.ordered
    @landing_zones = LandingZone.ordered
    @target_flight = Current.user.flights.find_by(id: params[:flight_id])
  end

  def create
    target_flight = Current.user.flights.find_by(id: import_params[:target_flight_id])
    aircraft = target_flight&.aircraft || Aircraft.find_by(id: import_params[:aircraft_id])
    landing_zone = target_flight&.landing_zone || LandingZone.find_by(id: import_params[:landing_zone_id])
    raise FlySight::Error, "Select an aircraft and landing zone." unless aircraft && landing_zone

    service = import_params[:import_type] == "exofdr" ? ExoFdr::ImportService : FlySight::ImportService
    flight_import = service.create!(
      source_files,
      user: Current.user,
      aircraft:,
      landing_zone:,
      target_flight:
    )
    target_flight&.update!(status: "processing")
    (flight_import.import_type == "exofdr" ? ExoFdrImportJob : FlySightImportJob).perform_later(flight_import)

    respond_to_upload_success(flight_import_path(flight_import), t(".queued"))
  rescue FlySight::Error, ExoFdr::Error, Zip::Error, ActiveRecord::RecordInvalid, ActiveStorage::Error => error
    respond_to_upload_failure(error.message)
  end

  def show
    @flight_import = Current.user.flight_imports.find(params[:id])
    @flights = @flight_import.flights.recent
  end

  private

  def source_files
    params.dig(:flight_import, :source_files) || []
  end

  def import_params
    params.fetch(:flight_import, {}).permit(:import_type, :aircraft_id, :landing_zone_id, :target_flight_id)
  end

  def respond_to_upload_success(redirect_url, notice)
    if request.format.json?
      flash[:notice] = notice
      render json: { redirect_url: redirect_url }, status: :created
    else
      redirect_to(redirect_url, notice: notice)
    end
  end

  def respond_to_upload_failure(message)
    if request.format.json?
      render json: { error: message }, status: :unprocessable_entity
    else
      redirect_back fallback_location: root_path, alert: message
    end
  end
end
