require "set"
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
      blobs = @flight_import.source_files.attachments.includes(:blob).map(&:blob)
      files = []
      @seen_sequences = Hash.new { |sets, boot_id| sets[boot_id] = SequenceSet.new }
      @next_sequence_by_boot = {}
      # Lock all recorder boots in a stable order, without retaining decoded records.
      headers = blobs.map { |blob| Decoder.new(StringIO.new(blob.download_chunk(0...Decoder::FILE_HEADER_SIZE))).header }
      recordings = headers.to_h do |header|
        boot_id = header.fetch("boot_id")
        [ boot_id, FdrRecording.create_or_find_by!(user: @flight_import.user, recorder_key:, boot_id:) ]
      end
      recordings.values.uniq.sort_by(&:id).each(&:lock!)
      @flight_import.flights.where.not(id: @flight_import.target_flight_id).destroy_all
      blobs.zip(headers).each.with_index(1) do |(blob, header), index|
        files << import_file(blob, header, recordings.fetch(header.fetch("boot_id")), index)
      end
      @flight_import.update!(
        status: "imported",
        firmware_version: headers.first["firmware"],
        log_started_at: @first_started_at,
        details: @flight_import.details.to_h.merge(
          "format" => "exofdr_binary_v#{headers.first.fetch('format_version')}", "files" => files
        )
      )
    ensure
      @seen_sequences&.each_value(&:close)
    end

    def import_file(blob, header, recording, index)
      records = FlightImports::SampleBuffer.new(symbolize_keys: false)
      points = FlightImports::SampleBuffer.new
      sensors = FlightImports::SampleBuffer.new
      sync = @flight_import.details.to_h["sync"]
      min_us = max_us = nil
      clock = RecordingClock.new
      observe = lambda do |record|
        clock.observe(record)
        timestamp = record.fetch("timestamp_us")
        min_us = timestamp if !min_us || timestamp < min_us
        max_us = timestamp if !max_us || timestamp > max_us
      end
      stats = blob.open do |io|
        decoder = Decoder.new(io, recover: !sync, source_file: blob.filename.to_s,
          seen_sequences: @seen_sequences, next_sequence_by_boot: @next_sequence_by_boot, on_record: observe)
        decoder.each_record { |record| records << record }
        decoder.stats
      end
      if sync && %w[skipped_bytes partial_tail_bytes].any? { |key| stats.fetch(key).positive? }
        raise Error, "The synchronized ExoFDR file contains damaged or truncated data."
      end
      duration = min_us ? (max_us - min_us) / 1_000_000.0 : 0.0
      if sync && duration < FdrSync::Ingest::MIN_RECORDING_DURATION_SECONDS
        @flight_import.update!(details: @flight_import.details.merge("ignored" => true, "duration_seconds" => duration))
        return { "filename" => blob.filename.to_s, "source_blob_id" => blob.id, "header" => header, "recovery" => stats }
      end
      started_at = clock.started_at
      @first_started_at = started_at if index == 1
      if sync
        resolution = FdrIdentity::Resolve.new(@flight_import.device_id, at: started_at).call
        @flight_import.update!(aircraft: resolution.aircraft)
      end
      origin_us = clock.origin_us.to_i
      records.each_slice(FlightImports::FlightWriter::INSERT_BATCH_SIZE) do |batch|
        unique = unreplayed_records(batch, recording)
        stats["duplicate_records"] += batch.size - unique.size
        batch_points, batch_sensors = records_to_samples(unique, recording:, blob:, origin_us:, recording_started_at: started_at)
        batch_points.each { |point| points << point }
        batch_sensors.each { |sample| sensors << sample }
      end
      if !points.empty? || !sensors.empty?
        FlightImports::FlightWriter.new(
          flight_import: @flight_import,
          name: [ "ExoFDR", started_at&.in_time_zone&.strftime("%Y-%m-%d %H:%M") || "session #{index}" ].join(" "),
          started_at:, track_points: points, sensor_samples: sensors, replace_target: index == 1
        ).call
      end
      identity = if started_at && @flight_import.device_id.present?
        EmbeddedController.find_by(device_id: @flight_import.device_id)&.recorder_identity(at: started_at)&.slice(:device_id, :assembly)
      end
      { "filename" => blob.filename.to_s, "source_blob_id" => blob.id, "header" => header, "recovery" => stats,
        "recorder_identity" => identity }
    ensure
      records&.close
      points&.close
      sensors&.close
    end

    def recorder_key
      if @flight_import.device_id.present?
        FdrIdentity::DeviceId.normalize(@flight_import.device_id)
      else
        # Binary headers do not identify the recorder. Never deduplicate unrelated devices by boot alone.
        "unidentified-import/#{@flight_import.id}"
      end
    end

    def unreplayed_records(records, recording)
      sequences = records.map { |record| record.fetch("sequence") }
      existing = [ TrackPoint, SensorSample ].flat_map do |model|
        model.where(fdr_recording_id: recording.id, fdr_sequence: sequences).pluck(:fdr_sequence)
      end.to_set
      records.select { |record| !existing.include?(record.fetch("sequence")) }
    end

    def records_to_samples(records, origin_records: records, recording: nil, blob: nil,
      origin_us: origin_records.first&.fetch("timestamp_us", 0).to_i, recording_started_at: started_at_for(origin_records))
      points = []
      sensors = []
      records.each do |record|
        elapsed = (record.fetch("timestamp_us").to_i - origin_us) / 1_000_000.0
        recorded_at = recording_started_at ? recording_started_at + elapsed : nil
        case record["type"]
        when "gps_pvt"
          points << provenance(record, recording, blob).merge(
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
          )
        when "imu"
          sensors << sensor_sample("IMU:#{record['sensor']}", record, recorded_at, elapsed, %w[accuracy x y z w]).merge(provenance(record, recording, blob))
        when "airspeed"
          sensors << sensor_sample("AIRSPEED", record, recorded_at, elapsed,
            %w[sensor_pressure_pa differential_pressure_pa temperature_c airspeed_m_s]).merge(provenance(record, recording, blob))
        when "system_event"
          sensors << sensor_sample("SYSTEM_EVENT", record, recorded_at, elapsed, %w[code severity text]).merge(provenance(record, recording, blob))
        when "marker"
          sensors << sensor_sample("MARKER", record, recorded_at, elapsed, %w[marker_id source_system source_component]).merge(provenance(record, recording, blob))
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

    def provenance(record, recording, blob)
      return {} unless recording

      { fdr_recording_id: recording.id, fdr_sequence: record.fetch("sequence"),
        fdr_timestamp_us: record.fetch("timestamp_us"), source_blob_id: blob.id }
    end

    def started_at_for(records)
      RecordingClock.new(records).started_at
    end
  end
end
