# Original recording file offloaded from a Lite through the mobile app. The
# original is kept as received; decoding into a flight happens in
# LiteRecordingImportJob.
class LiteRecordingUpload < ApplicationRecord
  STATUSES = %w[queued awaiting_decoder imported failed].freeze
  SHA256_PATTERN = /\A[0-9a-f]{64}\z/
  FILE_IDS = 0..0xFFFF_FFFF

  belongs_to :embedded_controller
  belongs_to :recorder_ownership
  belongs_to :user
  belongs_to :flight_import, optional: true
  has_one_attached :original

  validates :status, inclusion: { in: STATUSES }
  validates :sha256, format: { with: SHA256_PATTERN }, uniqueness: { scope: :embedded_controller_id }
  validates :file_id, inclusion: { in: FILE_IDS }
  validates :byte_size, numericality: { only_integer: true, greater_than: 0 }

  def filename
    format("LITE_%08X.BIN", file_id)
  end

  def flight_code
    flight_import&.flights&.order(:started_at)&.first&.code
  end
end
