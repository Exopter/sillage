module Hangar
  class PartsController < BaseController
    before_action :set_part, only: %i[show edit update destroy]

    def index
      @parts = Part.includes(:function, :assembly).ordered
    end

    def show
      @test_runs = @part.test_runs.includes(:build).recent
    end

    def new
      @part = Part.new(internal_number: Part.next_internal_number, state: "available")
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
      allowed = %i[internal_number function_id manufacturer model serial_number notes]
      allowed << :state if Current.user.admin?
      params.require(:part).permit(*allowed)
    end
  end
end
