module Hangar
  class PartsController < BaseController
    before_action :set_part, only: %i[show edit update destroy]

    def index
      @query = params[:q].to_s.strip
      @state = params[:state].presence_in(Part::STATES)
      @parts = Part.left_joins(:function).includes(:function, :assembly).ordered
      if @query.present?
        pattern = "%#{Part.sanitize_sql_like(@query)}%"
        @parts = @parts.where(<<~SQL.squish, pattern:)
          parts.internal_number LIKE :pattern OR parts.manufacturer LIKE :pattern OR
          parts.model LIKE :pattern OR parts.serial_number LIKE :pattern OR functions.name LIKE :pattern
        SQL
      end
      @parts = @parts.where(state: @state) if @state
    end

    def show
      @test_runs = @part.test_runs.includes(:build).recent
    end

    def new
      @part = Part.new(state: "available")
      load_form_options
    end

    def create
      @part = Part.new(part_params)
      if @part.save
        redirect_to hangar_part_path(@part), notice: "Part created."
      else
        load_form_options
        render :new, status: :unprocessable_entity
      end
    end

    def edit
      load_form_options
    end

    def update
      if @part.update(part_params)
        redirect_to hangar_part_path(@part), notice: "Part updated."
      else
        load_form_options
        render :edit, status: :unprocessable_entity
      end
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
    end

    def part_params
      allowed = %i[function_id manufacturer model serial_number notes]
      allowed << :state if Current.user.admin?
      params.require(:part).permit(*allowed)
    end

    def deletion_blocked_message
      "Cannot delete #{@part.internal_number} because it has #{@part.deletion_blockers.to_sentence}. " \
        "Remove current references first; historical records must be retained."
    end
  end
end
