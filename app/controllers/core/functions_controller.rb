module Core
  class FunctionsController < BaseController
    before_action :set_function, only: %i[show edit update destroy]

    def index
      @functions = Function.ordered
    end

    def show
      @parts = @function.parts.includes(:assembly).ordered
    end

    def new
      @function = Function.new
    end

    def create
      @function = Function.new(function_params)
      if @function.save
        redirect_to core_function_path(@function), notice: "Function created."
      else
        render :new, status: :unprocessable_entity
      end
    end

    def edit
    end

    def update
      if @function.update(function_params)
        redirect_to core_function_path(@function), notice: "Function updated."
      else
        render :edit, status: :unprocessable_entity
      end
    end

    def destroy
      if @function.destroy
        redirect_to core_functions_path, notice: "Function deleted."
      else
        redirect_to core_function_path(@function), alert: @function.errors.full_messages.to_sentence
      end
    end

    private

    def set_function
      @function = Function.find(params[:id])
    end

    def function_params
      params.require(:function).permit(:code, :name, :description)
    end
  end
end
