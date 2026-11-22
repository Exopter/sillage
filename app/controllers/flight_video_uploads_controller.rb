class FlightVideoUploadsController < ApplicationController
  include FlightBrowser

  before_action :set_flight
  before_action :set_upload, only: %i[chunk complete]
  before_action { no_store }

  rescue_from Flights::ChunkedVideoUpload::Error do |error|
    render json: { error: error.message }, status: :unprocessable_entity
  end
  rescue_from Flights::ChunkedVideoUpload::Incomplete do |error|
    render json: { error: error.message, received: @upload.received }, status: :conflict
  end

  def create
    upload = Flights::ChunkedVideoUpload.start(
      flight: @flight, user: Current.user, filename: params[:filename], content_type: params[:content_type],
      byte_size: params[:byte_size], last_modified: params[:last_modified]
    )
    render json: { id: upload.id, chunk_size: upload.chunk_size, received: upload.received }, status: :created
  end

  def chunk
    @upload.write_chunk(params[:index], request.body)
    head :no_content
  end

  def complete
    @upload.complete do |file, filename, content_type|
      Flights::QueueVideoProcessing.new(flight: @flight, io: file, filename:, content_type:).call
    end
    flash[:notice] = t("flights.update.success")
    render json: { redirect_url: destination }
  end

  private

  def set_flight
    @flight = Flight.visible_to(Current.user).find(params[:flight_id])
  end

  def set_upload
    @upload = Flights::ChunkedVideoUpload.find(flight: @flight, user: Current.user, id: params[:id])
  end

  def destination
    return flight_path(@flight) unless params[:return_to_browser] == "1"

    flights_path(**browser_return_parameters, selected: "flight:#{@flight.id}")
  end
end
