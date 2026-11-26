require "open3"

module Videos
  class MediaTools
    class Error < StandardError; end

    def initialize(ffprobe_path: ENV.fetch("FFPROBE_PATH", "ffprobe"), timeout_seconds: 1_800)
      @ffprobe_path = ffprobe_path
      @timeout_seconds = timeout_seconds
    end

    def probe_duration(path)
      stdout = run!(
        @ffprobe_path,
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
  end
end
