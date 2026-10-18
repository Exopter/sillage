module Forge
  class FdrsController < BaseController
    include Pagination

    before_action :set_fdr, only: %i[show update parts files connectivity activity calibration]
    before_action :load_fdr_context, only: %i[show parts files connectivity activity calibration]

    def index
      @assemblies = Assembly.where(assembly_type: "ExoFDR").includes(:fdr_functional_configuration,
        active_fdr_board_installation: { embedded_controller: [ :signal_presence, :recorder_connections ] }).ordered
      @fdrs = EmbeddedController.includes(:signal_presence, :recorder_connections, active_fdr_board_installation: :assembly).ordered
      @unassigned_fdrs = @fdrs.reject { |fdr| fdr.assembly || fdr.fdr_board_installations.exists? }
      live_fdrs = @fdrs.select { |fdr| fdr.assembly && fdr.signal_presence&.fresh? }
      @default_wifi_configuration_fdr = live_fdrs.one? ? live_fdrs.first : (@fdrs.one? ? @fdrs.first : nil)
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
              assembly_method: params.require(:assembly_method))
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
      @available_parts = @assembly.serviceability_state == "retired" ? Part.none : Part.available.joins(:function).where.not(functions: { code: "CONTROLLER" }).includes(:function).ordered
      @available_assemblies = Assembly.none
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

    def load_setup_options
      @available_boards = EmbeddedController.where.not(id: FdrBoardInstallation.active.select(:embedded_controller_id)).ordered
      @available_fdrs = Assembly.not_retired.where(assembly_type: "ExoFDR").where.not(id: FdrBoardInstallation.active.select(:assembly_id)).ordered
      @functional_configurations = FdrFunctionalConfiguration.ordered
    end

    def historical_records(model, timestamp)
      return model.where(embedded_controller_id: @fdr.id) unless @assembly

      table = model.table_name
      model.where(<<~SQL, @assembly.id)
        EXISTS (SELECT 1 FROM fdr_board_installations bindings
          WHERE bindings.assembly_id = ?
            AND bindings.embedded_controller_id = #{table}.embedded_controller_id
            AND bindings.installed_at <= #{table}.#{timestamp}
            AND (bindings.removed_at IS NULL OR bindings.removed_at > #{table}.#{timestamp}))
      SQL
    end
  end
end
