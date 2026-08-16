module Hangar
  class AssembliesController < BaseController
    before_action :set_assembly, only: %i[
      show edit update destroy connectivity install_part remove_part replace_part attach_assembly detach_assembly
    ]
    before_action :load_fdr_context, only: %i[show connectivity]

    def index
      @assemblies = Assembly.includes(:parent, :parts, :children).ordered.to_a
      @selected_assembly = @assemblies.find { |assembly| assembly.id == params[:assembly_id].to_i } || @assemblies.first
    end

    def show
      @available_parts = Part.available.includes(:function).ordered
      excluded_ids = [ @assembly.id, *@assembly.descendant_ids ]
      @available_assemblies = Assembly.where(parent_id: nil).where.not(id: excluded_ids).ordered
    end

    def connectivity
      return head :not_found unless @fdr

      @wifi_profiles = @assembly.fdr_wifi_profiles.includes(:wifi_credential).ordered
      assigned_ids = @wifi_profiles.map(&:wifi_credential_id)
      @known_wifi_credentials = WifiCredential.where.not(id: assigned_ids).ordered
      @preview_wifi = (Rails.env.local? || Rails.env.test?) && params[:preview] == "wifi"
    end

    def new
      @assembly = Assembly.new
      load_parent_options
    end

    def create
      @assembly = Assembly.new(assembly_params)
      if @assembly.save
        redirect_to hangar_assembly_path(@assembly), notice: "Assembly created."
      else
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
      @parent_options = Assembly.where.not(id: excluded_ids).ordered
    end

    def load_fdr_context
      @fdr = @assembly.flight_data_recorder?
      return unless @fdr

      @controller_part = @assembly.parts.joins(:function).find_by(functions: { code: "CONTROLLER" })
      @aircraft = @assembly.installations.active.includes(:aircraft).first&.aircraft
    end

    def assembly_params
      params.require(:assembly).permit(:name, :device_id, :parent_id, :notes)
    end

    def deletion_blocked_message
      "Cannot delete #{@assembly.internal_number} because it has #{@assembly.deletion_blockers.to_sentence}. " \
        "Remove current references first; historical records must be retained."
    end
  end
end
