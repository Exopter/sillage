module Hangar
  class AircraftController < BaseController
    before_action :set_aircraft, only: %i[show edit update destroy]

    def index
      @aircraft = Aircraft.includes(:flights, installations: :installable).ordered.to_a
      @aircraft.sort_by! { |aircraft| [ -aircraft.installations.count(&:active?), aircraft.registration ] }
      @selected_aircraft = @aircraft.find { |aircraft| aircraft.id == params[:aircraft_id].to_i } || @aircraft.first
      @active_installations = @selected_aircraft&.installations&.select(&:active?) || []
      @active_installation_count = Installation.active.count
      @attention_count = Part.where(state: %w[quarantined retired]).count + Aircraft.where(active: false).count
    end

    def show
      @installations = @aircraft.installations.includes(:installable).recent
      @available_assemblies = Assembly.roots.where.not(id: Installation.active.where(installable_type: "Assembly").select(:installable_id)).ordered
      @available_parts = Part.available.where.not(id: Installation.active.where(installable_type: "Part").select(:installable_id)).ordered
    end

    def new
      @aircraft = Aircraft.new(active: true)
    end

    def create
      @aircraft = Aircraft.new(aircraft_params)
      if @aircraft.save
        redirect_to hangar_aircraft_path(@aircraft), notice: "Aircraft created."
      else
        render :new, status: :unprocessable_entity
      end
    end

    def edit; end

    def update
      if @aircraft.update(aircraft_params)
        redirect_to hangar_aircraft_path(@aircraft), notice: "Aircraft updated."
      else
        render :edit, status: :unprocessable_entity
      end
    end

    def destroy
      if @aircraft.deletion_blockers.any?
        return redirect_to hangar_aircraft_path(@aircraft), alert: deletion_blocked_message
      end

      if @aircraft.destroy
        redirect_to hangar_aircraft_index_path, notice: "Aircraft deleted."
      else
        redirect_to hangar_aircraft_path(@aircraft), alert: @aircraft.errors.full_messages.to_sentence
      end
    end

    private

    def set_aircraft
      @aircraft = Aircraft.find(params[:id])
    end

    def aircraft_params
      params.require(:aircraft).permit(:registration, :name, :notes, :active)
    end

    def deletion_blocked_message
      "Cannot delete #{@aircraft.registration} because it has #{@aircraft.deletion_blockers.to_sentence}. " \
        "Historical records must be retained."
    end
  end
end
