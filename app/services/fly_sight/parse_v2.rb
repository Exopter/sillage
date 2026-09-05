module FlySight
  class ParseV2
    GPS_EPOCH = Time.utc(1980, 1, 6)
    def initialize(track_text, sensor_text, track_filename: "TRACK.CSV", sensor_filename: "SENSOR.CSV")
      @track_text = track_text
      @sensor_text = sensor_text
      @track_filename = track_filename
      @sensor_filename = sensor_filename
    end

    def call
      track_document = parse_document(@track_text)
      sensor_document = parse_document(@sensor_text)
      track_points = parse_track_points(track_document)
      sensor_samples = parse_sensor_samples(sensor_document, track_points.first&.fetch(:recorded_at, nil))

      raise Error, "No valid GNSS point was found in #{@track_filename}." if track_points.empty?

      ParsedSession.new(
        format: "flysight_v2",
        metadata: {
          "track_file" => @track_filename,
          "sensor_file" => @sensor_filename,
          "track_vars" => track_document.fetch(:vars),
          "sensor_vars" => sensor_document.fetch(:vars),
          "track_columns" => track_document.fetch(:columns),
          "sensor_columns" => sensor_document.fetch(:columns)
        },
        track_points: track_points,
        sensor_samples: sensor_samples
      )
    rescue StandardError
      track_points&.close
      sensor_samples&.close
      raise
    end

    private

    def parse_document(source)
      vars = {}
      columns = {}
      in_data = false
      header_bytes = 0
      CsvTools.lines(source).each_with_index do |line, index|
        header_bytes += line.bytesize
        raise Error, "FlySight V2 metadata exceeds 64 KiB." if header_bytes > FlightImports::Limits::MAX_METADATA_BYTES
        raise Error, "FlySight V2 header exceeds 256 lines." if index >= FlightImports::Limits::MAX_HEADER_LINES

        row = CsvTools.parse_line(line)
        next if row.blank?

        case row.first.to_s
        when "$VAR" then vars[row[1].to_s] = row.drop(2).join(",")
        when "$COL" then columns[CsvTools.normalize_sensor_name(row[1])] = row.drop(2)
        when "$DATA"
          in_data = true
          break
        end
      end
      raise Error, "Invalid FlySight V2 file: missing $DATA section." unless in_data

      rows = Enumerator.new do |output|
        data = false
        CsvTools.lines(source).each do |line|
          row = CsvTools.parse_line(line)
          unless data
            data = row&.first == "$DATA"
            next
          end
          output << row unless row.blank?
        end
      end
      { vars: vars, columns: columns, rows: rows }
    end

    def parse_track_points(document)
      columns = document.fetch(:columns).fetch("GNSS") do
        raise Error, "#{@track_filename} does not contain a $COL,GNSS definition."
      end

      points = FlightImports::SampleBuffer.new
      document.fetch(:rows).each do |row|
        next unless CsvTools.normalize_sensor_name(row.first) == "GNSS"

        values = columns.zip(row.drop(1)).to_h
        recorded_at = CsvTools.timestamp(values["time"])
        next unless recorded_at

        points << {
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
          satellite_count: CsvTools.integer(values["numSV"])
        }
      end
      points
    rescue StandardError
      points&.close
      raise
    end

    def parse_sensor_samples(document, first_track_time)
      rows = FlightImports::SampleBuffer.new
      document.fetch(:rows).each do |row|
        sensor = CsvTools.normalize_sensor_name(row.first)
        columns = document.fetch(:columns)[sensor]
        next if columns.blank?

        values = columns.zip(row.drop(1)).to_h
        elapsed_seconds = CsvTools.numeric(values["time"])
        readings = values.except("time").transform_values { |value| CsvTools.numeric(value) }
        readings["sensor_time"] = elapsed_seconds if elapsed_seconds.is_a?(Numeric)
        readings["pressure_altitude_m"] = Flights::PressureAltitude.from_pascals(readings["pressure"]) if sensor == "BARO"

        rows << {
          sensor_type: sensor,
          elapsed_seconds: elapsed_seconds.is_a?(Numeric) ? elapsed_seconds : nil,
          readings: readings
        }
      end

      sync_origin = sensor_sync_origin(rows, first_track_time)

      samples = FlightImports::SampleBuffer.new
      rows.each do |sample|
        recorded_at = if sync_origin && sample[:elapsed_seconds]
          sync_origin + sample[:elapsed_seconds]
        end
        elapsed_seconds = if recorded_at && first_track_time
          recorded_at - first_track_time
        else
          sample[:elapsed_seconds]
        end

        samples << sample.merge(recorded_at: recorded_at, elapsed_seconds: elapsed_seconds)
      end
      samples
    rescue StandardError
      samples&.close
      raise
    ensure
      rows&.close
    end

    def sensor_sync_origin(rows, first_track_time)
      time_sample = rows.find do |sample|
        sample[:sensor_type] == "TIME" &&
          sample[:elapsed_seconds] &&
          sample.dig(:readings, "tow").is_a?(Numeric) &&
          sample.dig(:readings, "week").is_a?(Numeric)
      end

      if time_sample
        gps_time = GPS_EPOCH + (time_sample.dig(:readings, "week").to_i * 7 * 86_400) + time_sample.dig(:readings, "tow").to_f
        gps_time - time_sample[:elapsed_seconds]
      elsif first_track_time
        first_elapsed = rows.find { |sample| sample[:elapsed_seconds] }&.fetch(:elapsed_seconds)
        first_elapsed ? first_track_time - first_elapsed : nil
      end
    end
  end
end
