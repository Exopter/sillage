module Forge
  class FdrsController < BaseController
    include Pagination

    before_action :set_fdr, only: %i[show update parts files connectivity activity calibration]
    before_action :load_fdr_context, only: %i[show parts files connectivity activity calibration]

    before_action :load_workspace

    def index
      @assemblies = Assembly.connectable_fdrs.includes(:fdr_functional_configuration,
        active_fdr_board_installation: { embedded_controller: [ :signal_presence, :recorder_connections ] }).ordered
      @fdrs = EmbeddedController.includes(:signal_presence, :recorder_connections, active_fdr_board_installation: :assembly).ordered
      @unassigned_fdrs = @fdrs.reject { |fdr| fdr.assembly || fdr.fdr_board_installations.exists? }
      live_fdrs = @fdrs.select { |fdr| fdr.assembly && fdr.signal_presence&.fresh? }
      @default_wifi_configuration_fdr = live_fdrs.one? ? live_fdrs.first : (@fdrs.one? ? @fdrs.first : nil)
      return if params[:connect] == "1"
      selected = @assemblies.find { |assembly| assembly.serial_number == session[:forge_recorder] } || @assemblies.find { |assembly| assembly.id == @default_wifi_configuration_fdr&.assembly&.id } || @assemblies.first
      redirect_to files_forge_fdr_path(selected.serial_number) if selected
    end

    def show
      load_setup_options
    end

    def update
      EmbeddedController.transaction do
        if @assembly
          incoming = EmbeddedController.find(params.require(:board_id))
          FdrIdentity::BindBoard.new(assembly: @assembly, controller: incoming, actor: Current.user,
            replace: params[:replace_board] == "1").call
        else
          @assembly = if params[:assembly_id].present?
            Assembly.find(params[:assembly_id])
          else
            Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration_id: params.require(:configuration_id),
              assembly_method: params[:assembly_method], fdr_component_type: params[:fdr_component_type])
          end
          FdrIdentity::BindBoard.new(assembly: @assembly, controller: @fdr, actor: Current.user).call
        end
      end
      redirect_to forge_fdr_path(@assembly.serial_number), notice: "FDR identity saved. Its name will be applied when connected."
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => error
      redirect_to forge_fdr_path(@assembly&.serial_number || @fdr.id), alert: error.message
    end

    def files
      @default_wifi_configuration_fdr = @fdr
    end

    def parts
      return redirect_to forge_fdr_path(@fdr) unless @assembly
      redirect_to forge_fdr_path(@assembly.serial_number, anchor: "components")
    end

    def calibration
      @checks = historical_records(ImuCheck, :created_at).includes(:user, :flight).recent.limit(25)
    end

    def connectivity
      return redirect_to forge_fdr_path(@assembly.serial_number) unless @fdr
      @wifi_profiles = @fdr.fdr_wifi_profiles.includes(:wifi_credential).ordered
      @known_wifi_credentials = WifiCredential.where.not(id: @wifi_profiles.map(&:wifi_credential_id)).ordered
      @preview_wifi = (Rails.env.local? || Rails.env.test?) && params[:preview] == "wifi"
    end

    def activity
      @activities = paginate(historical_records(DeviceActivity, :occurred_at).includes(:actor).recent)
    end

    private

    def set_fdr
      if Assembly::EXOFDR_SERIAL_PATTERN.match?(params[:id].to_s)
        @assembly = Assembly.find_by!(serial_number: params[:id])
        return redirect_to hangar_assembly_path(@assembly) if @assembly.fdr_system?
        @fdr = @assembly.embedded_controller
      else
        @fdr = EmbeddedController.find(params[:id])
        @assembly = @fdr.assembly
        # Existing numeric links render the same FDR; new links use its serial.
      end
    end

    def load_fdr_context
      @aircraft = @fdr&.aircraft
      @controller_part = @fdr&.part
    end

    def load_workspace
      @workspace_recorders = Assembly.connectable_fdrs.includes(:fdr_functional_configuration, active_fdr_board_installation: :embedded_controller).ordered
      session[:forge_recorder] = @assembly.serial_number if @assembly
    end

    def load_setup_options
      @available_boards = EmbeddedController.where.not(id: FdrBoardInstallation.active.select(:embedded_controller_id)).ordered
      @available_fdrs = Assembly.not_retired.connectable_fdrs.where.not(id: FdrBoardInstallation.active.select(:assembly_id)).ordered
      @functional_configurations = FdrFunctionalConfiguration.ordered
    end

    def historical_records(model, timestamp)
      return model.where(embedded_controller_id: @fdr.id) unless @assembly

      bindings = FdrBoardInstallation.arel_table
      records = model.arel_table
      period = bindings[:installed_at].lteq(records[timestamp])
        .and(bindings[:removed_at].eq(nil).or(bindings[:removed_at].gt(records[timestamp])))
      matching = bindings.project(Arel.sql("1")).where(
        bindings[:assembly_id].eq(@assembly.id)
          .and(bindings[:embedded_controller_id].eq(records[:embedded_controller_id]))
          .and(period)
      )
      model.where(matching.exists)
    end
  end
end
