require "stringio"
require "set"
require "zip"

module FlySight
  class ImportService
    FilePayload = Data.define(:path, :filename, :content, :content_type)
    SessionFile = Data.define(:format, :track, :sensor, :csv)

    class << self
      def create!(uploaded_files, user: Current.user, aircraft: nil, target_flight: nil)
        FlightImports::SourceBuilder.create!(
          uploaded_files,
          user:,
          import_type: "flysight",
          error_class: Error,
          empty_message: "Select a FlySight ZIP file or CSV files.",
          aircraft:,
          target_flight:,
          content_type: ->(file) { file.respond_to?(:content_type) ? file.content_type : "application/octet-stream" }
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
        missing_source_message: "No source file is attached to this import."
      ).call do
        import!
      end
    end

    private

    def read_attached_payloads
      @flight_import.source_files.attachments.includes(:blob).map do |attachment|
        blob = attachment.blob
        FilePayload.new(
          path: blob.filename.to_s,
          filename: blob.filename.to_s,
          content: blob.download,
          content_type: blob.content_type.presence || "application/octet-stream"
        )
      end
    end

    def expand_archives(payloads)
      payloads.flat_map do |payload|
        if zip?(payload)
          extract_zip(payload)
        else
          payload
        end
      end
    end

    def zip?(payload)
      payload.filename.to_s.downcase.end_with?(".zip") || payload.content.b.start_with?("PK\x03\x04".b)
    end

    def extract_zip(payload)
      files = []
      Zip::File.open_buffer(StringIO.new(payload.content)) do |zip_file|
        zip_file.each do |entry|
          next if entry.directory?
          next if entry.name.start_with?("__MACOSX/")

          filename = File.basename(entry.name)
          next unless filename.match?(/\A(?:TRACK|SENSOR)\.CSV\z/i) || filename.match?(/\.csv\z/i)

          files << FilePayload.new(
            path: entry.name,
            filename: filename,
            content: entry.get_input_stream.read,
            content_type: "text/csv"
          )
        end
      end

      files
    rescue Zip::Error
      raise Error, "#{payload.filename} is not a readable ZIP archive."
    end

    def detect_sessions(files)
      sessions = []
      used_paths = Set.new

      files.group_by { |file| File.dirname(file.path.to_s) }.each_value do |group|
        track = group.find { |file| basename(file) == "TRACK.CSV" }
        next unless track

        sensor = group.find { |file| basename(file) == "SENSOR.CSV" }
        raise Error, "#{track.path} was found without SENSOR.CSV in the same folder." unless sensor

        sessions << SessionFile.new(format: :v2, track: track, sensor: sensor, csv: nil)
        used_paths << track.path << sensor.path
      end

      files.each do |file|
        next if used_paths.include?(file.path)
        next unless file.filename.to_s.downcase.end_with?(".csv")
        next unless v1_candidate?(file)

        sessions << SessionFile.new(format: :v1, track: nil, sensor: nil, csv: file)
      end

      sessions
    end

    def basename(file)
      File.basename(file.path.to_s).upcase
    end

    def v1_candidate?(file)
      headers = CsvTools.parse_line(text(file).each_line.first).to_a
      (ParseV1::REQUIRED_COLUMNS - headers).empty?
    end

    def parse_session(session)
      case session.format
      when :v2
        ParseV2.new(
          text(session.track),
          text(session.sensor),
          track_filename: session.track.path,
          sensor_filename: session.sensor.path
        ).call
      when :v1
        ParseV1.new(text(session.csv), filename: session.csv.path).call
      end
    end

    def import!
      sessions = detect_sessions(expand_archives(read_attached_payloads))
      raise Error, "No usable FlySight session was found." if sessions.empty?

      parsed_sessions = sessions.map { |session| parse_session(session) }
      FlightImport.transaction do
        @flight_import.flights.where.not(id: @flight_import.target_flight_id).destroy_all
        parsed_sessions.each.with_index(1) do |parsed_session, index|
          FlightImports::FlightWriter.new(
            flight_import: @flight_import,
            name: generated_name(parsed_session, index),
            started_at: parsed_session.started_at,
            track_points: parsed_session.track_points,
            sensor_samples: parsed_session.sensor_samples,
            replace_target: index == 1
          ).call
        end

        first = parsed_sessions.first
        @flight_import.update!(
          status: "imported",
          error_message: nil,
          device_id: metadata_value(first, "DEVICE_ID"),
          firmware_version: metadata_value(first, "FIRMWARE_VER"),
          session_id: metadata_value(first, "SESSION_ID"),
          log_started_at: first.started_at,
          details: {
            "format" => parsed_sessions.map(&:format).uniq.join(", "),
            "sessions_count" => parsed_sessions.size,
            "sessions" => parsed_sessions.map(&:metadata)
          }
        )
      end
    end

    def generated_name(parsed_session, index)
      timestamp = parsed_session.started_at&.in_time_zone&.strftime("%Y-%m-%d %H:%M")
      [ "FlySight", timestamp || "session #{index}" ].join(" ")
    end

    def metadata_value(parsed_session, key)
      metadata = parsed_session.metadata
      metadata.dig("sensor_vars", key).presence || metadata.dig("track_vars", key).presence
    end

    def text(payload)
      payload.content.dup.force_encoding("UTF-8").scrub
    end
  end
end
