class FlightImportsController < ApplicationController
  def new
  end

  def create
    flight_import = FlySight::ImportService.create!(source_files, user: Current.user)
    FlySightImportJob.perform_later(flight_import)

    redirect_to(flight_import, notice: t(".queued"))
  rescue FlySight::Error, Zip::Error, ActiveRecord::RecordInvalid, ActiveStorage::Error => error
    redirect_back fallback_location: root_path, alert: error.message
  end

  def show
    @flight_import = Current.user.flight_imports.find(params[:id])
    @jumps = @flight_import.jumps.recent
  end

  private

  def source_files
    params.dig(:flight_import, :source_files) || []
  end
end
