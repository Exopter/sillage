module Flights
  # Makes a stored video the flight's source and queues its web optimization.
  class QueueVideoProcessing
    def self.upload(flight:, io:, filename:, content_type:)
      blob = ActiveStorage::Blob.create_and_upload!(io:, filename:, content_type:)
      attach(flight:, blob:)
    rescue StandardError
      blob&.purge unless blob&.attachments&.exists?
      raise
    end

    def self.attach(flight:, blob:)
      flight.with_lock do
        next if flight.video_upload_attachment&.blob_id == blob.id

        flight.video_upload.attach(blob)
        flight.update!(video_processing_status: "processing", video_processing_error: nil)
        raise ActiveJob::EnqueueError, "The video could not be queued." unless FlightVideoProcessingJob.perform_later(flight, blob)
      end
      blob
    end
  end
end
