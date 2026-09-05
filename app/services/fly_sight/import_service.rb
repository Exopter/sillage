require "stringio"
require "set"
require "zip"
require "zlib"

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
      blobs = @flight_import.source_files.attachments.includes(:blob).map(&:blob)
      blobs.map do |blob|
        file = temporary_file
        blob.open { |source| IO.copy_stream(source, file) }
        file.rewind
        FilePayload.new(path: blob.filename.to_s, filename: blob.filename.to_s,
          content: file, content_type: blob.content_type.to_s)
      end
    end

    def temporary_file
      Tempfile.new("flysight-import", binmode: true).tap { |file| @temporary_files << file }
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
      payload.content.rewind
      signature = payload.content.read(4)
      payload.content.rewind
      payload.filename.to_s.downcase.end_with?(".zip") || signature == "PK\x03\x04".b
    end

    # Validate the supported single-volume ZIP directory before reading entries.
    def validate_zip_directory!(io)
      io.seek([ io.size - 65_557, 0 ].max)
      tail = io.read(65_557)
      raise Error, "ZIP64 archives are not supported." if tail.include?("PK\x06\x07".b) || tail.include?("PK\x06\x06".b)

      offset = tail.rindex("PK\x05\x06".b)
      raise Error, "ZIP central directory is missing." unless offset && tail.bytesize - offset >= 22

      disk, directory_disk, entries_on_disk, entries, bytes, position, comment_size = tail.byteslice(offset + 4, 18).unpack("vvvvVVv")
      unless disk.zero? && directory_disk.zero? && entries_on_disk == entries &&
          position + bytes <= io.size && tail.bytesize == offset + 22 + comment_size
        raise Error, "Multi-volume or malformed ZIP archives are not supported."
      end
    end

    def extract_zip(payload)
      validate_zip_directory!(payload.content)
      files = []
      Zip::File.open(payload.content.path) do |zip_file|
        zip_file.each do |entry|
          raise Error, "ZIP entry path exceeds 1 KiB." if entry.name.bytesize > 1.kilobyte
          next if entry.directory?
          next if entry.name.start_with?("__MACOSX/")

          filename = File.basename(entry.name)
          next unless filename.match?(/\.csv\z/i)

          file = temporary_file
          bytes = 0
          crc = 0
          entry.get_input_stream do |input|
            while (chunk = input.read(64.kilobytes)) && !chunk.empty?
              bytes += chunk.bytesize
              crc = Zlib.crc32(chunk, crc)
              file.write(chunk)
            end
          end
          raise Error, "ZIP entry size or CRC does not match its directory." unless bytes == entry.size && crc == entry.crc

          file.rewind
          files << FilePayload.new(path: entry.name, filename: filename, content: file, content_type: "text/csv")
        end
      end
      files
    rescue Zip::Error, Zlib::Error => error
      raise Error, "#{payload.filename} is not a readable ZIP archive: #{error.message}"
    end

    def detect_sessions(files)
      raise Error, "FlySight sources contain ambiguous duplicate paths." if files.map(&:path).uniq.size != files.size

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
      headers = CsvTools.parse_line(CsvTools.lines(file.content).first).to_a
      (ParseV1::REQUIRED_COLUMNS - headers).empty?
    end

    def parse_session(session)
      case session.format
      when :v2
        ParseV2.new(
          session.track.content,
          session.sensor.content,
          track_filename: session.track.path,
          sensor_filename: session.sensor.path
        ).call
      when :v1
        ParseV1.new(session.csv.content, filename: session.csv.path).call
      end
    end

    def import!
      @temporary_files = []
      sessions = detect_sessions(expand_archives(read_attached_payloads))
      raise Error, "No usable FlySight session was found." if sessions.empty?

      metadata = []
      formats = []
      @flight_import.flights.where.not(id: @flight_import.target_flight_id).destroy_all
      sessions.each.with_index(1) do |session, index|
        parsed = parse_session(session)

        FlightImports::FlightWriter.new(
          flight_import: @flight_import, name: generated_name(parsed, index), started_at: parsed.started_at,
          track_points: parsed.track_points, sensor_samples: parsed.sensor_samples, replace_target: index == 1
        ).call
        if index == 1
          @flight_import.assign_attributes(device_id: metadata_value(parsed, "DEVICE_ID"),
            firmware_version: metadata_value(parsed, "FIRMWARE_VER"), session_id: metadata_value(parsed, "SESSION_ID"),
            log_started_at: parsed.started_at)
        end
        metadata << parsed.metadata
        formats << parsed.format
      ensure
        parsed&.close
      end
      @flight_import.update!(status: "imported", error_message: nil,
        details: { "format" => formats.uniq.join(", "), "sessions_count" => sessions.size, "sessions" => metadata })
    ensure
      @temporary_files&.each(&:close!)
    end

    def generated_name(parsed_session, index)
      timestamp = parsed_session.started_at&.in_time_zone&.strftime("%Y-%m-%d %H:%M")
      [ "FlySight", timestamp || "session #{index}" ].join(" ")
    end

    def metadata_value(parsed_session, key)
      metadata = parsed_session.metadata
      metadata.dig("sensor_vars", key).presence || metadata.dig("track_vars", key).presence
    end
  end
end
