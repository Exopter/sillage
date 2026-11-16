module Hangar
  class AircraftController < BaseController
    before_action :set_aircraft, only: %i[show edit update destroy]

    def index
      load_fleet(params[:aircraft_id])
    end

    # The fleet page is the aircraft's page: one place to see and change what is installed.
    def show
      load_fleet(@aircraft.id)
      render :index
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

    def load_fleet(selected_id)
      @fleet = Aircraft.includes(installations: :installable).ordered.to_a
      @flight_counts = Flight.visible_to(Current.user).group(:aircraft_id).count
      @fleet.sort_by! { |aircraft| [ -aircraft.installations.count(&:active?), aircraft.registration ] }
      @selected_aircraft = @fleet.find { |aircraft| aircraft.id == selected_id.to_i } || @fleet.first
      return unless @selected_aircraft

      @active_installations = @selected_aircraft.installations.select(&:active?)
      @installations = @selected_aircraft.installations.includes(:installable).recent
      @install_options = install_options
      @replacement_parts = Part.available.includes(:function).ordered.group_by(&:function_id)
    end

    # Everything that could go on the aircraft, with where it is now. Choosing
    # equipment that is on another aircraft or inside an assembly moves it.
    def install_options
      elsewhere = Installation.active.where.not(aircraft: @selected_aircraft).includes(:aircraft, :installable)
        .index_by { |installation| [ installation.installable_type, installation.installable_id ] }
      here = @active_installations.map { |installation| [ installation.installable_type, installation.installable_id ] }.to_set
      assemblies = Assembly.not_retired.roots.ordered.to_a
      nested = Part.where(state: "installed").joins(:active_part_installation).includes(:function, active_part_installation: :assembly)
        .where.not(id: EmbeddedController.where.not(part_id: nil).select(:part_id)).ordered.to_a
      parts = Part.available.includes(:function).ordered.to_a + elsewhere.values.map(&:installable).grep(Part) + nested
      (assemblies + parts.uniq).reject { |asset| here.include?([ asset.class.name, asset.id ]) }.map do |asset|
        part = asset.is_a?(Part)
        other = elsewhere[[ asset.class.name, asset.id ]]&.aircraft
        holder = asset.assembly if part
        { label: part ? asset.display_name : asset.selection_label, kind: part ? "part" : "assembly",
          meta: part ? [ asset.function.name, ("S/N #{asset.serial_number}" if asset.serial_number.present?), asset.internal_number ].compact.join(" \u00b7 ") : "Assembly \u00b7 #{helpers.pluralize(asset.snapshot_part_numbers.size, "part")}",
          icon: part ? "settings" : "layers",
          where: other ? "On #{other.registration}" : holder ? "In #{holder.identity_label}" : "In stock",
          note: ("Installing here moves it" if other || holder),
          fields: { "installation[installable_type]" => asset.class.name, "installation[installable_id]" => asset.id } }
      end
    end

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
