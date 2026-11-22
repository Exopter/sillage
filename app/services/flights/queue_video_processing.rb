module Flights
  # Stores an uploaded video as the flight's source and queues its web optimization.
  class QueueVideoProcessing
    def initialize(flight:, io:, filename:, content_type:)
      @flight = flight
      @io = io
      @filename = filename
      @content_type = content_type
    end

    def call
      blob = ActiveStorage::Blob.create_and_upload!(io: @io, filename: @filename, content_type: @content_type)
      @flight.with_lock do
        @flight.video_upload.attach(blob)
        @flight.update!(video_processing_status: "processing", video_processing_error: nil)
        raise ActiveJob::EnqueueError, "The video could not be queued." unless FlightVideoProcessingJob.perform_later(@flight, blob)
      end
      blob
    rescue StandardError
      blob&.purge unless blob&.attachments&.exists?
      raise
    end
  end
end
