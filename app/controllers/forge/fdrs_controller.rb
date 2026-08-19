module Forge
  class FdrsController < BaseController
    before_action :set_fdr, only: %i[show update connectivity activity]
    before_action :load_fdr_context, only: %i[show connectivity activity]

    def index
      @fdrs = EmbeddedDevice.includes(:assembly, :signal_presence, assembly: { installations: :aircraft }).ordered
      live_fdrs = @fdrs.select { |fdr| fdr.signal_presence&.fresh? }
      @default_wifi_configuration_fdr = live_fdrs.one? ? live_fdrs.first : (@fdrs.one? ? @fdrs.first : nil)
    end

    def show
      @available_assemblies = available_assemblies
      @latest_build = @assembly&.builds&.recent&.first
      @recent_test_runs = @assembly ? TestRun.joins(:build).where(builds: { assembly_id: @assembly.id }).recent.limit(5) : TestRun.none
    end

    def update
      previous_assembly = @fdr.assembly
      if @fdr.update(fdr_params)
        if previous_assembly != @fdr.assembly
          @fdr.record_activity!(
            "assembly_linked",
            source: "forge",
            actor: Current.user,
            details: {
              previous_asset_id: previous_assembly&.internal_number,
              asset_id: @fdr.assembly&.internal_number
            }.compact
          )
        end
        redirect_to forge_fdr_path(@fdr), notice: "FDR physical asset updated."
      else
        load_fdr_context
        @available_assemblies = available_assemblies
        @latest_build = @assembly&.builds&.recent&.first
        @recent_test_runs = TestRun.none
        render :show, status: :unprocessable_entity
      end
    end

    def connectivity
      @wifi_profiles = @fdr.fdr_wifi_profiles.includes(:wifi_credential).ordered
      assigned_ids = @wifi_profiles.map(&:wifi_credential_id)
      @known_wifi_credentials = WifiCredential.where.not(id: assigned_ids).ordered
      @preview_wifi = (Rails.env.local? || Rails.env.test?) && params[:preview] == "wifi"
    end

    def activity
      @activities = @fdr.device_activities.includes(:actor).recent
    end

    private

    def set_fdr
      @fdr = EmbeddedDevice.find(params[:id])
    end

    def load_fdr_context
      @assembly = @fdr.assembly
      @aircraft = @fdr.aircraft
      @controller_part = @assembly&.parts&.joins(:function)&.find_by(functions: { code: "CONTROLLER" })
    end

    def available_assemblies
      Assembly.left_outer_joins(:embedded_device)
        .where("embedded_devices.id IS NULL OR assemblies.id = ?", @fdr.assembly_id || -1)
        .ordered
    end

    def fdr_params
      params.require(:embedded_device).permit(:assembly_id)
    end
  end
end
