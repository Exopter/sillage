require "stringio"

module ExoFdr
  class ImportService
    class << self
      def create!(uploaded_files, user: Current.user, aircraft: nil, target_flight: nil)
        FlightImports::SourceBuilder.create!(
          uploaded_files,
          user:,
          import_type: "exofdr",
          error_class: Error,
          empty_message: "Select an ExoFDR binary file.",
          aircraft:,
          target_flight:,
          content_type: ->(_file) { "application/octet-stream" }
        )
      end
    end

    def initialize(flight_import)
      @flight_import = flight_import
    end

    def call
      FlightImports::Processor.new(
        @flight_import,
        error_class: Error,
        missing_source_message: "No ExoFDR file is attached to this import."
      ).call do
        import!
      end
    end

    private

    def import!
      decoded_files = @flight_import.source_files.attachments.includes(:blob).map do |attachment|
        [ attachment.blob.filename.to_s, Decoder.new(StringIO.new(attachment.blob.download)).call ]
      end

      FlightImport.transaction do
        @flight_import.flights.where.not(id: @flight_import.target_flight_id).destroy_all
        decoded_files.each.with_index(1) { |(_filename, result), index| create_flight!(result, index) }
        first = decoded_files.first.last
        @flight_import.update!(
          status: "imported",
          firmware_version: first.header["firmware"],
          log_started_at: started_at_for(first.records),
          details: @flight_import.details.to_h.merge(
            "format" => "exofdr_binary_v#{first.header.fetch('format_version')}",
            "files" => decoded_files.map do |filename, result|
              { "filename" => filename, "header" => result.header, "recovery" => result.stats }
            end
          )
        )
      end
    end

    def create_flight!(result, index)
      points, sensors = records_to_samples(result.records)
      started_at = started_at_for(result.records)
      FlightImports::FlightWriter.new(
        flight_import: @flight_import,
        name: [ "ExoFDR", started_at&.in_time_zone&.strftime("%Y-%m-%d %H:%M") || "session #{index}" ].join(" "),
        started_at:,
        track_points: points,
        sensor_samples: sensors,
        replace_target: index == 1
      ).call
    end

    def records_to_samples(records)
      origin_us = records.first&.fetch("timestamp_us", 0).to_i
      gps_time = records.filter_map { |record| gps_recorded_at(record) }.first
      points = []
      sensors = []
      records.each do |record|
        elapsed = (record.fetch("timestamp_us").to_i - origin_us) / 1_000_000.0
        recorded_at = gps_time ? gps_time + elapsed : nil
        case record["type"]
        when "gps_pvt"
          recorded_at = gps_recorded_at(record) || recorded_at
          points << {
            recorded_at:,
            elapsed_seconds: elapsed,
            lat: record["latitude_deg_e7"].to_f / 10_000_000,
            lon: record["longitude_deg_e7"].to_f / 10_000_000,
            altitude_m: record["height_msl_mm"].to_f / 1_000,
            vel_n_mps: record["velocity_north_mm_s"].to_f / 1_000,
            vel_e_mps: record["velocity_east_mm_s"].to_f / 1_000,
            vel_d_mps: record["velocity_down_mm_s"].to_f / 1_000,
            horizontal_accuracy_m: record["horizontal_accuracy_mm"].to_f / 1_000,
            vertical_accuracy_m: record["vertical_accuracy_mm"].to_f / 1_000,
            speed_accuracy_mps: record["speed_accuracy_mm_s"].to_f / 1_000,
            heading_deg: record["heading_motion_deg_e5"].to_f / 100_000,
            course_accuracy_deg: record["heading_accuracy_deg_e5"].to_f / 100_000,
            gps_fix: record["fix_type"],
            satellite_count: record["satellites"]
          }
        when "imu"
          sensors << sensor_sample("IMU:#{record['sensor']}", record, recorded_at, elapsed, %w[accuracy x y z w])
        when "airspeed"
          sensors << sensor_sample("AIRSPEED", record, recorded_at, elapsed,
            %w[sensor_pressure_pa differential_pressure_pa temperature_c airspeed_m_s])
        when "system_event"
          sensors << sensor_sample("SYSTEM_EVENT", record, recorded_at, elapsed, %w[code severity text])
        when "marker"
          sensors << sensor_sample("MARKER", record, recorded_at, elapsed, %w[marker_id source_system source_component])
        end
      end
      [ points, sensors ]
    end

    def sensor_sample(type, record, recorded_at, elapsed, keys)
      {
        sensor_type: type,
        recorded_at:,
        elapsed_seconds: elapsed,
        readings: record.slice(*keys)
      }
    end

    def gps_recorded_at(record)
      return unless record["type"] == "gps_pvt" && record["utc_valid"].to_i.positive?

      Time.utc(
        record["year"], record["month"], record["day"], record["hour"], record["minute"], record["second"],
        record["nano_seconds"].to_i / 1_000
      )
    rescue ArgumentError, TypeError
      nil
    end

    def started_at_for(records)
      records.filter_map { |record| gps_recorded_at(record) }.first
    end
  end
end
