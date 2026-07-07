class FlightImportsController < ApplicationController
  def new
  end

  def create
    flight_import = FlySight::ImportService.create!(source_files, user: Current.user)
    FlySightImportJob.perform_later(flight_import)

    respond_to_upload_success(flight_import_path(flight_import), t(".queued"))
  rescue FlySight::Error, Zip::Error, ActiveRecord::RecordInvalid, ActiveStorage::Error => error
    respond_to_upload_failure(error.message)
  end

  def show
    @flight_import = Current.user.flight_imports.find(params[:id])
    @jumps = @flight_import.jumps.recent
  end

  private

  def source_files
    params.dig(:flight_import, :source_files) || []
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
