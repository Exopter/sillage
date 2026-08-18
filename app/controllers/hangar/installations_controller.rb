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
      record_fdr_activity(
        installation,
        "installed_in_aircraft",
        aircraft_registration: aircraft.registration,
        installed_at: installation.installed_at.iso8601
      )
      redirect_to hangar_aircraft_path(aircraft), notice: "#{installation.installable_type} installed."
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound, KeyError => error
      redirect_to hangar_aircraft_path(params[:aircraft_id]), alert: error.message
    end

    def destroy
      installation = Installation.active.find(params[:id])
      installation.remove!
      record_fdr_activity(
        installation,
        "removed_from_aircraft",
        aircraft_registration: installation.aircraft.registration,
        removed_at: installation.removed_at.iso8601
      )
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

    def record_fdr_activity(installation, event_type, details)
      return unless installation.installable.is_a?(Assembly)

      installation.installable.embedded_device&.record_activity!(
        event_type,
        source: "hangar",
        actor: Current.user,
        details:
      )
    end
  end
end
