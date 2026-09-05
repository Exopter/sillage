module FlySight
  class ParseV1
    REQUIRED_COLUMNS = %w[time lat lon hMSL velN velE velD].freeze

    def initialize(text, filename: nil)
      @text = text
      @filename = filename
    end

    def call
      lines = CsvTools.lines(@text).lazy.map(&:strip).reject(&:blank?)
      headers = CsvTools.parse_line(lines.first).to_a
      validate_headers!(headers)

      track_points = FlightImports::SampleBuffer.new
      lines.drop(2).each do |line|
        row = CsvTools.parse_line(line)
        next if row.blank?

        values = headers.zip(row).to_h
        recorded_at = CsvTools.timestamp(values["time"])
        next unless recorded_at

        track_points << {
          recorded_at: recorded_at,
          lat: CsvTools.finite_numeric(values["lat"]),
          lon: CsvTools.finite_numeric(values["lon"]),
          altitude_m: CsvTools.finite_numeric(values["hMSL"]),
          vel_n_mps: CsvTools.finite_numeric(values["velN"]),
          vel_e_mps: CsvTools.finite_numeric(values["velE"]),
          vel_d_mps: CsvTools.finite_numeric(values["velD"]),
          horizontal_accuracy_m: CsvTools.finite_numeric(values["hAcc"]),
          vertical_accuracy_m: CsvTools.finite_numeric(values["vAcc"]),
          speed_accuracy_mps: CsvTools.finite_numeric(values["sAcc"]),
          heading_deg: CsvTools.finite_numeric(values["heading"]),
          course_accuracy_deg: CsvTools.finite_numeric(values["cAcc"]),
          gps_fix: CsvTools.integer(values["gpsFix"]),
          satellite_count: CsvTools.integer(values["numSV"])
        }
      end

      raise Error, "No valid GPS point was found in #{@filename || "the FlySight CSV"}." if track_points.empty?

      ParsedSession.new(
        format: "flysight_v1",
        metadata: {
          "source" => @filename,
          "columns" => headers
        },
        track_points: track_points,
        sensor_samples: []
      )
    rescue StandardError
      track_points&.close
      raise
    end

    private

    def validate_headers!(headers)
      missing = REQUIRED_COLUMNS - headers
      return if missing.empty?

      raise Error, "Invalid FlySight V1 CSV: missing columns #{missing.join(", ")}."
    end
  end
end
