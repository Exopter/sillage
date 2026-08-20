class ExoFdrImportJob < ApplicationJob
  queue_as :imports

  discard_on ActiveJob::DeserializationError

  def perform(flight_import)
    ExoFdr::ImportService.new(flight_import).call
  end
end
