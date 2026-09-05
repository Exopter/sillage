require "digest"

module FdrSync
  class Ingest
    Result = Data.define(:flight_import, :duplicate, :sha256)

    MIN_RECORDING_DURATION_SECONDS = 5.0
    FILENAME_PATTERN = /\AFDR\d{6}\.BIN\z/i
    SHA256_PATTERN = /\A[0-9a-f]{64}\z/

    TRANSPORTS = %w[usb_cdc wifi_https].freeze

    def initialize(user:, upload:, metadata:, transport: "usb_cdc", enqueue: true)
      @user = user
      @upload = upload
      @metadata = metadata.to_h.stringify_keys
      @transport = transport.to_s
      @enqueue = enqueue
    end

    def call
      validate_metadata!
      actual_sha256 = Digest::SHA256.file(@upload.tempfile.path).hexdigest
      raise Error, "The uploaded file does not match its declared SHA-256." unless actual_sha256 == expected_sha256

      existing = @user.flight_imports.find_by(source_sha256: actual_sha256)
      return resume_import(existing, actual_sha256) if existing

      @upload.tempfile.rewind
      header = ExoFdr::Decoder.new(@upload.tempfile).header
      validate_header!(header)
      flight_import = create_import!(header, actual_sha256)
      result_for(flight_import, sha256: actual_sha256)
    rescue ActiveRecord::RecordNotUnique
      existing = @user.flight_imports.find_by!(source_sha256: expected_sha256)
      resume_import(existing, expected_sha256)
    end

    private

    def resume_import(flight_import, sha256)
      flight_import.with_lock do
        enqueue_import!(flight_import) unless flight_import.imported?
      end
      result_for(flight_import, duplicate: true, sha256:)
    end

    def enqueue_import!(flight_import)
      return unless @enqueue

      raise ActiveJob::EnqueueError, "The FDR import could not be queued." unless ExoFdrImportJob.perform_later(flight_import)
    end

    def validate_metadata!
      raise Error, "Select an ExoFDR binary file." unless @upload.respond_to?(:tempfile)
      raise Error, "Invalid ExoFDR filename." unless filename.match?(FILENAME_PATTERN)
      raise Error, "Invalid SHA-256." unless expected_sha256.match?(SHA256_PATTERN)
      raise Error, "The uploaded file is empty." unless @upload.size.positive?
      raise Error, "The uploaded file size does not match the manifest." unless @upload.size == declared_size
      raise Error, "Unsupported FDR synchronization transport." unless @transport.in?(TRANSPORTS)
    end

    def validate_header!(header)
      raise Error, "The ExoFDR boot identifier does not match the manifest." unless header.fetch("boot_id") == declared_boot_id
      raise Error, "The ExoFDR format does not match the manifest." unless header.fetch("format_version") == declared_format_version
    end

    def result_for(flight_import, duplicate: false, sha256:)
      Result.new(flight_import:, duplicate:, sha256:)
    end

    def create_import!(header, actual_sha256)
      @upload.tempfile.rewind
      blob = ActiveStorage::Blob.create_and_upload!(io: @upload, filename:, content_type: "application/octet-stream")
      ActiveRecord::Base.current_transaction.after_rollback { blob.service.delete(blob.key) }
      FlightImport.transaction(requires_new: true) do
        flight_import = @user.flight_imports.create!(
          source_filename: filename,
          source_sha256: actual_sha256,
          status: "pending",
          import_type: "exofdr",
          device_id: @metadata.fetch("device_id"),
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
        flight_import.source_files.attach(blob)
        enqueue_import!(flight_import)
        flight_import
      end
    rescue StandardError
      blob&.purge unless blob&.attachments&.exists?
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
