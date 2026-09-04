module ExoFdr
  class RecordingClock
    def initialize(records)
      @records = records
    end

    def started_at
      origin_us = @records.first&.fetch("timestamp_us", 0).to_i
      @records.each do |record|
        anchor_at = gps_recorded_at(record)
        next unless anchor_at

        anchor_elapsed = (record.fetch("timestamp_us").to_i - origin_us) / 1_000_000.0
        return anchor_at - anchor_elapsed
      end

      nil
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
