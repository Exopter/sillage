module Hangar
  class PartsController < BaseController
    before_action :set_part, only: %i[show edit update destroy]

    def index
      @query = params[:q].to_s.strip
      @state = params[:state].presence_in([ "all", *Part::STATES ])
      @parts = Part.left_joins(:function).includes(:function, active_part_installation: :assembly).ordered
        .where.not(id: EmbeddedController.where.not(part_id: nil).select(:part_id))
      if @query.present?
        pattern = "%#{Part.sanitize_sql_like(@query)}%"
        @parts = @parts.where(<<~SQL.squish, pattern:)
          parts.internal_number LIKE :pattern OR parts.manufacturer LIKE :pattern OR
          parts.model LIKE :pattern OR parts.serial_number LIKE :pattern OR functions.name LIKE :pattern
        SQL
      end
      @parts = @state == "all" ? @parts : @state ? @parts.where(state: @state) : @parts.where.not(state: "retired")
      @part_aircraft = Installation.active.where(installable_type: "Part").includes(:aircraft).to_h { |installation| [ installation.installable_id, installation.aircraft ] }
    end

    def show
      @forge_assembly = @part.embedded_controller&.assembly
      @aircraft_installation = Installation.active.includes(:aircraft).find_by(installable: @part)
      @part_installations = @part.part_installations.includes(:assembly).recent
    end

    def new
      @part = Part.new(state: "available")
      load_form_options
    end

    def create
      @part = Part.new(part_params)
      Part.transaction do
        @part.save!
        # Registering and installing in one step saves a second visit to the record.
        if (assembly_id = params[:part][:assembly_id]).present?
          @part.install_in!(Assembly.not_retired.find(assembly_id))
        end
      end
      redirect_to hangar_part_path(@part), notice: @part.assembly ? "Part created and installed in #{@part.assembly.identity_label}." : "Part created."
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => error
      attributes = part_params
      @part = Part.new(attributes)
      @part.valid?
      @part.errors.add(:base, error.message) if @part.errors.empty?
      load_form_options
      render :new, status: :unprocessable_entity
    end

    def edit
      load_form_options
    end

    def update
      if params.require(:part).key?(:assembly_id)
        @part.update_with_assembly!(part_params, assembly_id: params[:part][:assembly_id])
      else
        @part.update!(part_params)
      end
      redirect_to hangar_part_path(@part), notice: "Part updated."
    rescue ActiveRecord::RecordInvalid => error
      messages = error.record.errors.full_messages
      @part.reload.assign_attributes(part_params)
      messages.each { |message| @part.errors.add(:base, message) }
      load_form_options
      render :edit, status: :unprocessable_entity
    end

    def destroy
      if @part.deletion_blockers.any?
        return redirect_to hangar_part_path(@part), alert: deletion_blocked_message
      end

      if @part.destroy
        redirect_to hangar_parts_path, notice: "Part deleted."
      else
        redirect_to hangar_part_path(@part), alert: @part.errors.full_messages.to_sentence
      end
    end

    private

    def set_part
      @part = Part.find(params[:id])
    end

    def load_form_options
      @functions = Function.ordered
      @assemblies = Assembly.not_retired.ordered unless @part.persisted?
      @selected_assembly_id = params.dig(:part, :assembly_id) unless @part.persisted?
      if @part.persisted?
        @assemblies = Assembly.not_retired.or(Assembly.where(id: @part.assembly&.id)).ordered
        @selected_assembly_id = if params[:part]&.key?(:assembly_id)
          params[:part][:assembly_id]
        else
          @part.assembly&.id
        end
      end
    end

    def part_params
      allowed = %i[function_id manufacturer model serial_number notes]
      allowed << :state if can_manage_operations?
      params.require(:part).permit(*allowed)
    end

    def deletion_blocked_message
      "Cannot delete #{@part.internal_number} because it has #{@part.deletion_blockers.to_sentence}. " \
        "Remove current references first; historical records must be retained."
    end
  end
end
