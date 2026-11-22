class FlightVideoUploadsController < ApplicationController
  include FlightBrowser

  before_action :require_direct_upload
  before_action :set_flight
  before_action :set_upload, only: %i[sign complete]
  before_action { no_store }

  rescue_from Flights::DirectVideoUpload::Error do |error|
    render json: { error: error.message }, status: :unprocessable_entity
  end
  rescue_from Flights::DirectVideoUpload::Incomplete do |error|
    render json: { error: error.message, received: @upload.received }, status: :conflict
  end

  def create
    upload = Flights::DirectVideoUpload.start(
      flight: @flight, user: Current.user, filename: params[:filename], content_type: params[:content_type],
      byte_size: params[:byte_size], last_modified: params[:last_modified]
    )
    render json: { id: upload.id, part_size: upload.part_size, received: upload.received }, status: :created
  end

  def sign
    render json: { urls: @upload.sign(params[:parts].to_s.split(",")) }
  end

  def complete
    @upload.complete
    flash[:notice] = t("flights.update.success")
    render json: { redirect_url: destination }
  end

  private

  def require_direct_upload
    head :not_found unless Flights::DirectVideoUpload.enabled?
  end

  def set_flight
    @flight = Flight.visible_to(Current.user).find(params[:flight_id])
  end

  def set_upload
    @upload = Flights::DirectVideoUpload.find(flight: @flight, user: Current.user, id: params[:id])
  end

  def destination
    return flight_path(@flight) unless params[:return_to_browser] == "1"

    flights_path(**browser_return_parameters, selected: "flight:#{@flight.id}")
  end
end
