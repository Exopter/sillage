module Hangar
  class AssembliesController < BaseController
    before_action :set_assembly, only: %i[
      show edit update destroy install_part remove_part replace_part attach_assembly detach_assembly
    ]

    def index
      @state = params[:state].presence_in([ "all", *Assembly::SERVICEABILITY_STATES ])
      @inventory = AssemblyInventory.new(state: @state)
      @selected_node = @inventory.find(params[:node]) || @inventory.find("assembly-#{params[:assembly_id]}") || @inventory.roots.first
      render partial: "inventory_details", locals: { node: @selected_node } if turbo_frame_request?
    end

    def show
      @available_parts = @assembly.serviceability_state == "retired" ? Part.none : Part.available.includes(:function).ordered
      excluded_ids = [ @assembly.id, *@assembly.descendant_ids ]
      @available_assemblies = @assembly.serviceability_state == "retired" ? Assembly.none : Assembly.not_retired.roots.where.not(id: excluded_ids).ordered
      if @assembly.fdr_system?
        @available_parts = Part.none
        @available_assemblies = @available_assemblies.where(assembly_type: "ExoFDR", fdr_component_type: Assembly::FDR_MODULE_TYPES)
          .where.not(fdr_component_type: @assembly.children.select(:fdr_component_type))
      elsif @assembly.fdr_component_type.present?
        @available_assemblies = Assembly.none
      end
    end

    def new
      @assembly = Assembly.new(params.fetch(:assembly, ActionController::Parameters.new).permit(:assembly_type, :fdr_functional_configuration_id, :fdr_component_type))
      load_parent_options
    end

    def create
      @assembly = Assembly.new(assembly_params)
      if @assembly.assembly_type.in?(Assembly::ASSEMBLY_TYPES) && @assembly.save
        redirect_to hangar_assembly_path(@assembly), notice: "Assembly created."
      else
        @assembly.errors.add(:assembly_type, "must be selected") unless @assembly.assembly_type.in?(Assembly::ASSEMBLY_TYPES)
        load_parent_options
        render :new, status: :unprocessable_entity
      end
    end

    def edit
      load_parent_options
    end

    def update
      if @assembly.update(assembly_params)
        redirect_to hangar_assembly_path(@assembly), notice: "Assembly updated."
      else
        load_parent_options
        render :edit, status: :unprocessable_entity
      end
    end

    def destroy
      if @assembly.deletion_blockers.any?
        return redirect_to hangar_assembly_path(@assembly), alert: deletion_blocked_message
      end

      if @assembly.destroy
        redirect_to hangar_assemblies_path, notice: "Assembly deleted."
      else
        redirect_to hangar_assembly_path(@assembly), alert: @assembly.errors.full_messages.to_sentence
      end
    end

    def install_part
      part = Part.available.find(params.require(:part_id))
      part.install_in!(@assembly)
      redirect_to hangar_assembly_path(@assembly), notice: "#{part.internal_number} installed."
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => error
      redirect_to hangar_assembly_path(@assembly), alert: error.message
    end

    def remove_part
      part = @assembly.parts.find(params[:part_id])
      part.remove_from_assembly!
      redirect_to hangar_assembly_path(@assembly), notice: "#{part.internal_number} removed."
    end

    def replace_part
      outgoing = @assembly.parts.find(params[:part_id])
      incoming = Part.available.find(params.require(:replacement_part_id))
      unless outgoing.function_id == incoming.function_id
        return redirect_to hangar_assembly_path(@assembly), alert: "Replacement must have the same function."
      end

      Part.transaction do
        outgoing.remove_from_assembly!
        incoming.install_in!(@assembly)
      end
      redirect_to hangar_assembly_path(@assembly), notice: "#{outgoing.internal_number} replaced by #{incoming.internal_number}."
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => error
      redirect_to hangar_assembly_path(@assembly), alert: error.message
    end

    def attach_assembly
      child = Assembly.roots.find(params.require(:child_id))
      child.update!(parent: @assembly)
      redirect_to hangar_assembly_path(@assembly), notice: "#{child.internal_number} attached."
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => error
      redirect_to hangar_assembly_path(@assembly), alert: error.message
    end

    def detach_assembly
      child = @assembly.children.find(params[:child_id])
      child.update!(parent: nil)
      redirect_to hangar_assembly_path(@assembly), notice: "#{child.internal_number} detached."
    end

    private

    def set_assembly
      @assembly = Assembly.find(params[:id])
    end

    def load_parent_options
      excluded_ids = @assembly.persisted? ? [ @assembly.id, *@assembly.descendant_ids ] : []
      @parent_options = Assembly.not_retired.where.not(id: excluded_ids).ordered
      @functional_configurations = FdrFunctionalConfiguration.ordered
    end

    def assembly_params
      params.require(:assembly).permit(
        :name, :parent_id, :assembly_type, :fdr_functional_configuration_id, :fdr_component_type, :assembly_method, :serviceability_state, :notes, :imu_mount_profile
      )
    end

    def deletion_blocked_message
      "Cannot delete #{@assembly.internal_number} because it has #{@assembly.deletion_blockers.to_sentence}. " \
        "Remove current references first; historical records must be retained."
    end
  end
end
