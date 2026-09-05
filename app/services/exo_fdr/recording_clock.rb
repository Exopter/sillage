module ExoFdr
  class RecordingClock
    attr_reader :started_at, :origin_us

    def initialize(records = [])
      records.each do |record|
        observe(record)
        break if started_at
      end
    end

    def observe(record)
      @origin_us ||= record.fetch("timestamp_us").to_i
      return if @started_at

      anchor_at = gps_recorded_at(record)
      return unless anchor_at

      @started_at = anchor_at - (record.fetch("timestamp_us").to_i - @origin_us) / 1_000_000.0
    end

    private

    def gps_recorded_at(record)
      return unless record["type"] == "gps_pvt" && record["utc_valid"].to_i.positive?

      Time.utc(
        record["year"], record["month"], record["day"], record["hour"], record["minute"], record["second"],
        record["nano_seconds"].to_i / 1_000
      )
    rescue ArgumentError, TypeError
      nil
    end
  end
end
