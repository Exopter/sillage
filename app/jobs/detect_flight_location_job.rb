class DetectFlightLocationJob < ApplicationJob
  queue_as :geocoding

  discard_on ActiveJob::DeserializationError
  retry_on Flights::OpenStreetMapReverseGeocoder::Error, wait: :polynomially_longer, attempts: 3 do |job, error|
    Rails.logger.warn("Flight location detection failed for flight #{job.arguments.first&.id}: #{error.message}")
  end

  def perform(flight)
    Flights::DetectLocation.new(flight, geocoder:).call
  end

  private

  def geocoder
    Flights::OpenStreetMapReverseGeocoder.new
  end
end
