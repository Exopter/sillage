class FlightVideoProcessingJob < ApplicationJob
  queue_as :default

  discard_on ActiveJob::DeserializationError

  def perform(flight)
    return unless flight.video_upload.attached?

    result = Videos::WebOptimizer.new(flight.video_upload.blob).call
    flight.video.attach(
      io: result.io,
      filename: result.filename,
      content_type: "video/mp4"
    )
    flight.update!(
      video_processing_status: "ready",
      video_processing_error: nil,
      video_duration_seconds: result.duration_seconds
    )
    flight.video_upload.purge_later
  rescue Videos::WebOptimizer::Error => error
    flight.update!(
      video_processing_status: "failed",
      video_processing_error: error.message.truncate(500)
    )
    raise
  ensure
    result&.close
  end
end
