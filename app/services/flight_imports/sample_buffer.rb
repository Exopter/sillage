require "tempfile"
require "json"
require "time"

module FlightImports
  # Rewindable, disk-backed samples. JSON preserves raw readings without object deserialization.
  class SampleBuffer
    include Enumerable
    attr_reader :size

    def initialize(symbolize_keys: true)
      @file = Tempfile.new("flight-samples", binmode: true)
      @size = 0
      @symbolize_keys = symbolize_keys
    end

    def <<(sample)
      sample = sample.merge(recorded_at: sample[:recorded_at].iso8601(9)) if sample[:recorded_at]
      @file.write(JSON.generate(sample, allow_nan: true), "\n")

      @size += 1
      self
    end

    def each
      return enum_for(__method__) unless block_given?

      @file.flush
      File.open(@file.path, "rb") do |io|
        io.each_line do |line|
          sample = JSON.parse(line, allow_nan: true)
          if @symbolize_keys
            sample.transform_keys!(&:to_sym)
            sample[:recorded_at] = Time.iso8601(sample[:recorded_at]) if sample[:recorded_at]
          end
          yield sample
        end
      end
    end

    def empty?
      size.zero?
    end

    def close
      @file.close!
    end
  end
end
