require "open3"
require "tempfile"

module Videos
  class WebOptimizer
    class Error < StandardError; end

    Result = Struct.new(:io, :filename, :duration_seconds, keyword_init: true) do
      def close
        io&.close!
      end
    end

    def initialize(blob, ffmpeg_path: ENV.fetch("FFMPEG_PATH", "ffmpeg"), ffprobe_path: ENV.fetch("FFPROBE_PATH", "ffprobe"), timeout_seconds: 1_800)
      @blob = blob
      @ffmpeg_path = ffmpeg_path
      @ffprobe_path = ffprobe_path
      @timeout_seconds = timeout_seconds
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
        duration_seconds: probe_duration(output.path)
      )
    ensure
      input&.close!
      output&.close! unless result
    end

    private

    attr_reader :blob, :ffmpeg_path, :ffprobe_path

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
      run!(
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

    def probe_duration(path)
      stdout = run!(
        ffprobe_path,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        path
      ).first

      duration = Float(stdout)
      duration.positive? ? duration : nil
    rescue ArgumentError
      nil
    end

    def run!(*command)
      stdout, stderr, status = Open3.popen3(*command, pgroup: true) do |input, output, errors, process|
        input.close
        readers = [ output, errors ].map do |stream|
          Thread.new do
            buffer = +""
            loop do
              buffer << stream.readpartial(16_384)
              buffer = buffer.byteslice(-65_536, 65_536) if buffer.bytesize > 65_536
            end
          rescue EOFError
            buffer
          end
        end
        unless process.join(@timeout_seconds)
          Process.kill("TERM", -process.pid) rescue Errno::ESRCH
          Process.kill("KILL", -process.pid) unless process.join(2)
          raise Error, "#{command.first} exceeded the processing time limit"
        end
        [ *readers.map(&:value), process.value ]
      ensure
        readers&.each { |reader| reader.kill if reader.alive? }
      end
      raise Error, "#{command.first} failed: #{stderr.presence || stdout}" unless status.success?

      [ stdout, stderr ]
    rescue Errno::ENOENT
      raise Error, "#{command.first} is not installed"
    end

    def optimized_filename
      basename = blob.filename.base.parameterize.presence || "flight-video"
      "#{basename}-web.mp4"
    end
  end
end
