class ImuChecksController < ApplicationController
  before_action :set_flight

  def show
    @controllers = if @flight.fdr
      [ @flight.fdr.embedded_controller ].compact
    else
      EmbeddedController.where.not(device_id: nil).ordered.select { |controller| !@flight.aircraft || controller.aircraft == @flight.aircraft }
    end
    @fdr = @controllers.find { |controller| controller.id.to_s == params[:controller_id] } || @controllers.first
    @reference = @fdr && ImuCheck.where(embedded_controller: @fdr, kind: "calibration").recent.first
  end

  private

  def set_flight
    @flight = Current.user.flights.find(params[:flight_id])
  end
end
