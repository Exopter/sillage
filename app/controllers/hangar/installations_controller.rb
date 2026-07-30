module Hangar
  class InstallationsController < BaseController
    def create
      aircraft = Aircraft.find(params[:aircraft_id])
      installable = installable_class.find(params.require(:installation).fetch(:installable_id))
      installation = aircraft.installations.create!(
        installable:,
        installed_at: params.require(:installation)[:installed_at].presence || Time.current,
        notes: params.require(:installation)[:notes]
      )
      redirect_to hangar_aircraft_path(aircraft), notice: "#{installation.installable_type} installed."
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound, KeyError => error
      redirect_to hangar_aircraft_path(params[:aircraft_id]), alert: error.message
    end

    def destroy
      installation = Installation.active.find(params[:id])
      installation.remove!
      redirect_to hangar_aircraft_path(installation.aircraft), notice: "Installation removed."
    end

    private

    def installable_class
      case params.require(:installation).fetch(:installable_type)
      when "Assembly" then Assembly
      when "Part" then Part
      else raise ActiveRecord::RecordNotFound, "Unsupported asset type"
      end
    end
  end
end
