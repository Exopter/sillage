class ImuChecksController < ApplicationController
  before_action :set_flight

  def show
    @controllers = EmbeddedController.where.not(device_id: nil).ordered.select { |controller| !@flight.aircraft || controller.aircraft == @flight.aircraft }
    @fdr = @controllers.find { |controller| controller.id.to_s == params[:controller_id] } || @controllers.first
    @reference = @fdr && ImuCheck.where(embedded_controller: @fdr, kind: "calibration").recent.first
  end

  private

  def set_flight
    @flight = Current.user.flights.find(params[:flight_id])
  end
end
