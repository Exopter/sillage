require "tempfile"

module Videos
  class WebOptimizer
    Error = MediaTools::Error

    Result = Struct.new(:io, :filename, :duration_seconds, keyword_init: true) do
      def close
        io&.close!
      end
    end

    def initialize(blob, ffmpeg_path: ENV.fetch("FFMPEG_PATH", "ffmpeg"), ffprobe_path: ENV.fetch("FFPROBE_PATH", "ffprobe"), timeout_seconds: 1_800)
      @blob = blob
      @ffmpeg_path = ffmpeg_path
      @tools = MediaTools.new(ffprobe_path:, timeout_seconds:)
    end

    def call
      input = download_input
      output = Tempfile.new([ "sillage-video-", ".mp4" ], binmode: true)
      output.close

      run_ffmpeg(input.path, output.path)
      output.open
      output.binmode
      output.rewind

      result = Result.new(
        io: output,
        filename: optimized_filename,
        duration_seconds: @tools.probe_duration(output.path)
      )
    ensure
      input&.close!
      output&.close! unless result
    end

    private

    attr_reader :blob, :ffmpeg_path

    def download_input
      extension = blob.filename.extension_with_delimiter.presence || ".video"
      file = Tempfile.new([ "sillage-source-", extension ], binmode: true)
      blob.download { |chunk| file.write(chunk) }
      file.flush
      file.rewind
      file
    rescue StandardError
      file&.close!
      raise
    end

    def run_ffmpeg(input_path, output_path)
      @tools.run!(
        ffmpeg_path,
        "-hide_banner",
        "-y",
        "-threads", "2",
        "-filter_threads", "1",
        "-i", input_path,
        "-map", "0:v:0",
        "-map", "0:a?",
        "-vf", "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264",
        "-threads", "2",
        "-preset", "veryfast",
        "-crf", "23",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ac", "2",
        "-movflags", "+faststart",
        output_path
      )
    end

    def optimized_filename
      basename = blob.filename.base.parameterize.presence || "flight-video"
      "#{basename}-web.mp4"
    end
  end
end
