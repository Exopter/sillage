class FlightVideoProcessingJob < ApplicationJob
  queue_as :default
  self.enqueue_after_transaction_commit = false

  discard_on ActiveJob::DeserializationError

  def perform(flight, source_blob = flight.video_upload.blob)
    return unless source_blob
    return unless current_upload?(flight, source_blob)

    result = Videos::WebOptimizer.new(source_blob).call
    output_blob = ActiveStorage::Blob.create_and_upload!(
      io: result.io,
      filename: result.filename,
      content_type: "video/mp4"
    )
    flight.with_lock do
      return unless current_upload?(flight, source_blob)

      flight.video.attach(output_blob)
      flight.update!(
        video_processing_status: "ready",
        video_processing_error: nil,
        video_exit_offset_seconds: nil,
        video_duration_seconds: result.duration_seconds
      )
      flight.video_upload.purge_later
    end
  rescue Videos::WebOptimizer::Error => error
    flight.with_lock do
      if current_upload?(flight, source_blob)
        flight.update!(video_processing_status: "failed", video_processing_error: error.message.truncate(500))
      end
    end
    raise
  ensure
    result&.close
    output_blob&.purge unless output_blob&.attachments&.exists?
  end

  private

  def current_upload?(flight, source_blob)
    flight.video_upload_attachment&.blob_id == source_blob.id
  end
end
