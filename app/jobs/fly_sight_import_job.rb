class FlySightImportJob < ApplicationJob
  queue_as :default

  discard_on ActiveJob::DeserializationError

  def perform(flight_import)
    FlySight::ImportService.new(flight_import).call
  end
end
