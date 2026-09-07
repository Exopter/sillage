module Forge
  class FdrsController < BaseController
    include Pagination

    before_action :set_fdr, only: %i[show update connectivity activity]
    before_action :load_fdr_context, only: %i[show connectivity activity]

    def index
      @fdrs = EmbeddedController.includes(
        :signal_presence,
        part: { active_part_installation: { assembly: [ :hardware_definition, { installations: :aircraft } ] } }
      ).ordered
      live_fdrs = @fdrs.select { |fdr| fdr.signal_presence&.fresh? }
      @default_wifi_configuration_fdr = live_fdrs.one? ? live_fdrs.first : (@fdrs.one? ? @fdrs.first : nil)
    end

    def show
      @available_controller_parts = available_controller_parts
      @latest_build = @assembly&.builds&.recent&.first
      @recent_test_runs = @assembly ? TestRun.joins(:build).where(builds: { assembly_id: @assembly.id }).recent.limit(5) : TestRun.none
    end

    def update
      previous_part = @fdr.part
      if @fdr.update(fdr_params)
        if previous_part != @fdr.part
          @fdr.record_activity!(
            "controller_part_linked",
            source: "forge",
            actor: Current.user,
            details: {
              previous_asset_id: previous_part&.internal_number,
              asset_id: @fdr.part&.internal_number
            }.compact
          )
        end
        redirect_to forge_fdr_path(@fdr), notice: "Embedded controller part updated."
      else
        load_fdr_context
        @available_controller_parts = available_controller_parts
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
      @activities = paginate(@fdr.device_activities.includes(:actor).recent)
    end

    private

    def set_fdr
      @fdr = EmbeddedController.find(params[:id])
    end

    def load_fdr_context
      @assembly = @fdr.assembly
      @aircraft = @fdr.aircraft
      @controller_part = @fdr.part
    end

    def available_controller_parts
      Part.joins(:function)
        .left_outer_joins(:embedded_controller)
        .where(functions: { code: "CONTROLLER" })
        .where("embedded_controllers.id IS NULL OR parts.id = ?", @fdr.part_id || -1)
        .ordered
    end

    def fdr_params
      params.require(:embedded_controller).permit(:part_id)
    end
  end
end
