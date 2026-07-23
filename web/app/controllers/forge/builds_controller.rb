module Forge
  class BuildsController < BaseController
    before_action :set_build, only: %i[show edit update destroy clone refresh_snapshot]

    def index
      @builds = Build.includes(:assembly, :previous_build, :test_runs).recent
    end

    def show
      @test_runs = @build.test_runs.includes(:part, :operator, :validated_by).recent
      @part_changes = @build.part_changes
      @configuration_changes = @build.configuration_changes
    end

    def new
      @build = Build.new(
        code: Build.next_code,
        arduino_core_version: "3.3.10",
        assembly_id: params.dig(:build, :assembly_id)
      )
      load_assemblies
    end

    def create
      @build = Build.new(build_attributes.merge(created_by: Current.user))
      if @build.save
        redirect_to forge_build_path(@build), notice: "Build created from the current assembly."
      else
        load_assemblies
        render :new, status: :unprocessable_entity
      end
    end

    def edit
      return redirect_to forge_build_path(@build), alert: "Tested builds are immutable." if @build.locked?

      load_assemblies
    end

    def update
      return redirect_to forge_build_path(@build), alert: "Tested builds are immutable." if @build.locked?

      if @build.update(build_attributes)
        @build.refresh_snapshot!
        redirect_to forge_build_path(@build), notice: "Build updated and hardware snapshot refreshed."
      else
        load_assemblies
        render :edit, status: :unprocessable_entity
      end
    end

    def destroy
      if @build.destroy
        redirect_to forge_builds_path, notice: "Build deleted."
      else
        redirect_to forge_build_path(@build), alert: @build.errors.full_messages.to_sentence
      end
    end

    def clone
      copy = @build.clone_as_next!(by: Current.user)
      redirect_to edit_forge_build_path(copy), notice: "#{copy.code} created from the current assembly. Review its provenance before testing."
    end

    def refresh_snapshot
      @build.refresh_snapshot!
      redirect_to forge_build_path(@build), notice: "Hardware snapshot refreshed."
    rescue ActiveRecord::ReadOnlyRecord => error
      redirect_to forge_build_path(@build), alert: error.message
    end

    private

    def set_build
      @build = Build.find(params[:id])
    end

    def load_assemblies
      @assemblies = Assembly.ordered
    end

    def build_attributes
      attributes = params.require(:build).permit(
        :code, :assembly_id, :source_revision, :source_dirty, :source_diff, :source_diff_sha256,
        :arduino_core_version, :firmware_sha256, :notes, :notion_references_text
      ).to_h
      references = attributes.delete("notion_references_text").to_s.lines.map(&:strip).reject(&:blank?)
      attributes["notion_references"] = references
      attributes
    end
  end
end
