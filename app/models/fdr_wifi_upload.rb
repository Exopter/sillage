require "fileutils"

class FdrWifiUpload < ApplicationRecord
  STATUSES = %w[receiving verifying complete failed].freeze
  TOKEN_PATTERN = /\A[0-9a-f]{32}\z/
  FILENAME_PATTERN = /\AFDR\d{6}\.BIN\z/i
  SHA256_PATTERN = /\A[0-9a-f]{64}\z/
  MAX_FILE_SIZE = 512.megabytes

  class OffsetMismatch < StandardError
    attr_reader :expected_offset

    def initialize(expected_offset)
      @expected_offset = expected_offset
      super("The upload offset does not match the staged recording.")
    end
  end

  belongs_to :assembly
  belongs_to :flight_import, optional: true

  before_validation :assign_token, on: :create
  after_destroy :purge_staged_file

  validates :token, presence: true, uniqueness: true, format: { with: TOKEN_PATTERN }
  validates :status, inclusion: { in: STATUSES }
  validates :filename, presence: true, format: { with: FILENAME_PATTERN }
  validates :file_index, :boot_id, :format_version, numericality: { only_integer: true, greater_than: 0 }
  validates :size_bytes,
    numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_FILE_SIZE }
  validates :received_bytes,
    numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :sha256, presence: true, format: { with: SHA256_PATTERN }
  validate :received_bytes_within_manifest

  def manifest_matches?(attributes)
    %i[filename file_index boot_id format_version size_bytes sha256].all? do |attribute|
      public_send(attribute).to_s == attributes.fetch(attribute).to_s
    end
  end

  def append_chunk!(offset:, bytes:)
    with_lock do
      raise OffsetMismatch, actual_file_size unless status == "receiving"
      raise OffsetMismatch, actual_file_size if offset.negative?

      FileUtils.mkdir_p(staging_directory)
      File.open(staged_path, File::RDWR | File::CREAT, 0o600) do |file|
        file.binmode
        file.flock(File::LOCK_EX)
        actual_offset = file.size
        raise OffsetMismatch, actual_offset if offset > actual_offset

        if offset < actual_offset
          raise OffsetMismatch, actual_offset if offset + bytes.bytesize > actual_offset

          file.seek(offset)
          raise OffsetMismatch, actual_offset unless file.read(bytes.bytesize) == bytes
        else
          raise OffsetMismatch, actual_offset if actual_offset + bytes.bytesize > size_bytes

          file.seek(0, IO::SEEK_END)
          file.write(bytes)
          file.flush
          file.fsync
          actual_offset = file.size
        end
        update!(received_bytes: actual_offset) if received_bytes != actual_offset
      end
    end
    received_bytes
  end

  def reconcile_received_bytes!
    with_lock do
      actual = actual_file_size
      raise OffsetMismatch, actual if actual > size_bytes
      update!(received_bytes: actual) if received_bytes != actual
    end
    received_bytes
  end

  def begin_verification!
    with_lock do
      return if status.in?(%w[verifying complete])
      raise OffsetMismatch, actual_file_size unless status == "receiving" && actual_file_size == size_bytes

      update!(status: "verifying", received_bytes: size_bytes, error_message: nil)
    end
  end

  def complete!(flight_import:)
    update!(status: "complete", flight_import:, completed_at: Time.current, error_message: nil)
    purge_staged_file
  end

  def fail!(message)
    update!(status: "failed", error_message: message.to_s.first(2_000))
  end

  def staged_path
    staging_directory.join("#{token}.part")
  end

  def ingest_metadata
    {
      device_id: assembly.device_id,
      filename:,
      file_index:,
      boot_id:,
      format_version:,
      size_bytes:,
      sha256:
    }
  end

  private

  def assign_token
    self.token ||= SecureRandom.hex(16)
  end

  def staging_directory
    Rails.root.join(Rails.env.test? ? "tmp/fdr_wifi_uploads" : "storage/fdr_wifi_uploads")
  end

  def actual_file_size
    File.exist?(staged_path) ? File.size(staged_path) : 0
  end

  def purge_staged_file
    File.delete(staged_path) if File.exist?(staged_path)
  end

  def received_bytes_within_manifest
    return if received_bytes.blank? || size_bytes.blank? || received_bytes <= size_bytes

    errors.add(:received_bytes, "cannot exceed the manifest size")
  end
end
