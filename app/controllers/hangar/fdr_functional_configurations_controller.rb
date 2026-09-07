module Hangar
  class FdrFunctionalConfigurationsController < BaseController
    before_action :set_configuration, only: %i[show edit update destroy]

    def index
      @configurations = FdrFunctionalConfiguration.includes(:assemblies).ordered
    end

    def show
      @assemblies = @configuration.assemblies.ordered
    end

    def new
      @configuration = FdrFunctionalConfiguration.new
    end

    def create
      @configuration = FdrFunctionalConfiguration.new(configuration_params)
      if @configuration.save
        redirect_to hangar_fdr_functional_configuration_path(@configuration), notice: "Functional configuration created."
      else
        render :new, status: :unprocessable_entity
      end
    end

    def edit; end

    def update
      if @configuration.update(configuration_params)
        redirect_to hangar_fdr_functional_configuration_path(@configuration), notice: "Functional configuration updated."
      else
        render :edit, status: :unprocessable_entity
      end
    end

    def destroy
      if @configuration.destroy
        redirect_to hangar_fdr_functional_configurations_path, notice: "Functional configuration deleted."
      else
        redirect_to hangar_fdr_functional_configuration_path(@configuration), alert: @configuration.errors.full_messages.to_sentence
      end
    end

    private

    def set_configuration
      @configuration = FdrFunctionalConfiguration.find(params[:id])
    end

    def configuration_params
      params.require(:fdr_functional_configuration).permit(:version, :planned_capabilities)
    end
  end
end
