class FlightImport < ApplicationRecord
  STATUSES = %w[pending processing imported failed].freeze

  belongs_to :user
  belongs_to :aircraft, optional: true
  belongs_to :target_flight, class_name: "Flight", optional: true
  has_many :flights, dependent: :destroy, inverse_of: :flight_import
  has_many :fdr_wifi_uploads, dependent: :nullify
  has_many_attached :source_files

  validates :status, inclusion: { in: STATUSES }
  validates :import_type, inclusion: { in: %w[flysight exofdr] }
  validates :source_sha256,
    format: { with: /\A[0-9a-f]{64}\z/ },
    uniqueness: { scope: :user_id },
    allow_nil: true

  scope :recent, -> { order(created_at: :desc) }

  def imported?
    status == "imported"
  end

  def pending?
    status == "pending"
  end

  def processing?
    status == "processing"
  end

  def failed?
    status == "failed"
  end

  def recorder_label
    return device_id.presence || "Unknown" unless import_type == "exofdr"

    files = details.to_h["files"]
    return "Historical FDR identity unavailable" if files.blank?

    files.map { |file| FdrIdentity::Presentation.label(file["recorder_identity"]) }.uniq.join(" / ")
  end
end
