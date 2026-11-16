module Hangar
  class InstallationsController < BaseController
    def create
      aircraft = Aircraft.find(params[:aircraft_id])
      installable = installable_class.find(params.require(:installation).fetch(:installable_id))
      installed_at = params.require(:installation)[:installed_at].presence || Time.current
      installation = Installation.transaction do
        release(installable, at: installed_at)
        aircraft.installations.create!(installable:, installed_at:, notes: params.require(:installation)[:notes])
      end
      record_fdr_activity(
        installation,
        "installed_in_aircraft",
        aircraft_registration: aircraft.registration,
        installed_at: installation.installed_at.iso8601
      )
      redirect_to hangar_return_path(hangar_aircraft_path(aircraft)), notice: "#{installation.installable_type} installed."
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
      redirect_to hangar_return_path(hangar_aircraft_path(installation.aircraft)), notice: "Installation removed."
    end

    private

    # Installing equipment that is somewhere else moves it: the picker says so before the choice is confirmed.
    def release(installable, at:)
      Installation.active.where(installable:).find_each do |previous|
        previous.remove!(at:)
        record_fdr_activity(previous, "removed_from_aircraft", aircraft_registration: previous.aircraft.registration, removed_at: previous.removed_at.iso8601)
      end
      installable.remove_from_assembly!(at:) if installable.is_a?(Part) && installable.assembly
    end

    def installable_class
      case params.require(:installation).fetch(:installable_type)
      when "Assembly" then Assembly
      when "Part" then Part
      else raise ActiveRecord::RecordNotFound, "Unsupported asset type"
      end
    end

    def record_fdr_activity(installation, event_type, details)
      return unless installation.installable.is_a?(Assembly)

      installation.installable.embedded_controller&.record_activity!(
        event_type,
        source: "hangar",
        actor: Current.user,
        details:
      )
    end
  end
end
