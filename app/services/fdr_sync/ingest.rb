require "digest"

module FdrSync
  class Ingest
    Result = Data.define(:flight_import, :duplicate, :ignored, :duration_seconds, :sha256)

    MAX_FILE_SIZE = 512.megabytes
    MIN_RECORDING_DURATION_SECONDS = 5.0
    FILENAME_PATTERN = /\AFDR\d{6}\.BIN\z/i
    SHA256_PATTERN = /\A[0-9a-f]{64}\z/

    TRANSPORTS = %w[usb_cdc wifi_https].freeze

    def initialize(user:, upload:, metadata:, transport: "usb_cdc")
      @user = user
      @upload = upload
      @metadata = metadata.to_h.stringify_keys
      @transport = transport.to_s
    end

    def call
      validate_metadata!
      actual_sha256 = Digest::SHA256.file(@upload.tempfile.path).hexdigest
      raise Error, "The uploaded file does not match its declared SHA-256." unless actual_sha256 == expected_sha256

      existing = @user.flight_imports.find_by(source_sha256: actual_sha256)
      return result_for(existing, duplicate: true, sha256: actual_sha256) if existing

      decoded = decode_file
      validate_header!(decoded.header)
      duration_seconds = recording_duration_seconds(decoded.records)
      if duration_seconds < MIN_RECORDING_DURATION_SECONDS
        return result_for(nil, ignored: true, duration_seconds:, sha256: actual_sha256)
      end

      flight_import = create_import!(decoded.header, actual_sha256)
      ExoFdrImportJob.perform_later(flight_import)
      result_for(flight_import, duration_seconds:, sha256: actual_sha256)
    rescue ActiveRecord::RecordNotUnique
      existing = @user.flight_imports.find_by!(source_sha256: expected_sha256)
      result_for(existing, duplicate: true, sha256: expected_sha256)
    end

    private

    def validate_metadata!
      raise Error, "Select an ExoFDR binary file." unless @upload.respond_to?(:tempfile)
      raise Error, "Invalid ExoFDR filename." unless filename.match?(FILENAME_PATTERN)
      raise Error, "Invalid SHA-256." unless expected_sha256.match?(SHA256_PATTERN)
      raise Error, "The uploaded file is empty." unless @upload.size.positive?
      raise Error, "The uploaded file exceeds 512 MB." if @upload.size > MAX_FILE_SIZE
      raise Error, "The uploaded file size does not match the manifest." unless @upload.size == declared_size
      raise Error, "Unsupported FDR synchronization transport." unless @transport.in?(TRANSPORTS)
    end

    def decode_file
      @upload.tempfile.rewind
      result = ExoFdr::Decoder.new(@upload.tempfile, recover: false).call
      @upload.tempfile.rewind
      result
    end

    def validate_header!(header)
      raise Error, "The ExoFDR boot identifier does not match the manifest." unless header.fetch("boot_id") == declared_boot_id
      raise Error, "The ExoFDR format does not match the manifest." unless header.fetch("format_version") == declared_format_version
    end

    def recording_duration_seconds(records)
      timestamps = records.map { |record| record.fetch("timestamp_us").to_i }
      return 0.0 if timestamps.empty?

      (timestamps.max - timestamps.min) / 1_000_000.0
    end

    def result_for(flight_import, duplicate: false, ignored: false, duration_seconds: nil, sha256:)
      Result.new(flight_import:, duplicate:, ignored:, duration_seconds:, sha256:)
    end

    def create_import!(header, actual_sha256)
      resolution = FdrIdentity::Resolve.new(@metadata.fetch("device_id")).call
      flight_import = @user.flight_imports.create!(
        source_filename: filename,
        source_sha256: actual_sha256,
        status: "pending",
        import_type: "exofdr",
        device_id: @metadata.fetch("device_id"),
        aircraft: resolution.aircraft,
        firmware_version: header.fetch("firmware"),
        details: {
          "sync" => {
            "transport" => @transport,
            "protocol" => "EXS1",
            "boot_id" => declared_boot_id,
            "format_version" => declared_format_version,
            "file_index" => Integer(@metadata.fetch("file_index")),
            "size_bytes" => declared_size,
            "sha256" => actual_sha256
          }
        }
      )
      @upload.tempfile.rewind
      flight_import.source_files.attach(
        io: @upload,
        filename:,
        content_type: "application/octet-stream"
      )
      flight_import
    rescue StandardError
      flight_import&.destroy!
      raise
    ensure
      @upload.tempfile.rewind if @upload.respond_to?(:tempfile)
    end

    def filename
      @metadata.fetch("filename").to_s
    end

    def expected_sha256
      @metadata.fetch("sha256").to_s.downcase
    end

    def declared_size
      Integer(@metadata.fetch("size_bytes"))
    rescue ArgumentError, TypeError
      raise Error, "Invalid file size."
    end

    def declared_boot_id
      Integer(@metadata.fetch("boot_id"))
    rescue ArgumentError, TypeError
      raise Error, "Invalid boot identifier."
    end

    def declared_format_version
      Integer(@metadata.fetch("format_version"))
    rescue ArgumentError, TypeError
      raise Error, "Invalid format version."
    end
  end
end
