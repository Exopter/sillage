class TunnelVideoDownloadJob < ApplicationJob
  queue_as :default
  # Web optimization is CPU-bound; process one clip at a time.
  limits_concurrency to: 1, key: "tunnel_video_download", duration: 1.hour

  discard_on ActiveJob::DeserializationError

  def perform(video)
    return unless video.flight_id && video.status.in?(%w[pending failed])

    video.update!(status: "downloading", error_message: nil)
    source_blob = download(video)
    result = Videos::WebOptimizer.new(source_blob).call
    if result.duration_seconds.to_f < TunnelVideo::MINIMUM_DURATION_SECONDS
      # Accidental camera triggers produce clips of about one second.
      video.update!(duration_seconds: result.duration_seconds)
      return video.ignore!("Shorter than #{TunnelVideo::MINIMUM_DURATION_SECONDS.to_i} s")
    end

    video.file.attach(io: result.io, filename: result.filename, content_type: "video/mp4")
    video.update!(status: "ready", duration_seconds: result.duration_seconds)
  rescue TunnelMedia::Client::Error, Videos::WebOptimizer::Error => error
    video.update!(status: "failed", error_message: error.message.truncate(500))
    raise
  ensure
    result&.close
    source_blob&.purge
  end

  private

  def download(video)
    Tempfile.create([ "sillage-tunnel-", ".mp4" ], binmode: true) do |file|
      TunnelMedia::Client.download(video.source_url, file)
      file.rewind
      ActiveStorage::Blob.create_and_upload!(io: file, filename: video.filename.delete_prefix("#"), content_type: "video/mp4")
    end
  end
end
