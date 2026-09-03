class FlySightImportJob < ApplicationJob
  queue_as :imports

  discard_on ActiveJob::DeserializationError

  def perform(flight_import)
    imported = FlySight::ImportService.new(flight_import).call
    imported.flights.find_each { |flight| DetectFlightLocationJob.perform_later(flight) }
  end
end
