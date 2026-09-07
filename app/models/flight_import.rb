class FlightImport < ApplicationRecord
  STATUSES = %w[pending processing imported failed].freeze
  ACTIVITY_CLASSIFICATIONS = %w[moving stationary technical needs_review].freeze
  SET_ASIDE_CLASSIFICATIONS = %w[stationary technical].freeze

  belongs_to :user
  belongs_to :aircraft, optional: true
  belongs_to :target_flight, class_name: "Flight", optional: true
  has_many :flights, dependent: :destroy, inverse_of: :flight_import
  has_many :fdr_wifi_uploads, dependent: :nullify
  has_many_attached :source_files

  validates :status, inclusion: { in: STATUSES }
  validates :activity_classification, inclusion: { in: ACTIVITY_CLASSIFICATIONS }, allow_nil: true
  validates :import_type, inclusion: { in: %w[flysight exofdr] }
  validates :source_sha256,
    format: { with: /\A[0-9a-f]{64}\z/ },
    uniqueness: { scope: :user_id },
    allow_nil: true

  scope :recent, -> { order(created_at: :desc) }
  scope :set_aside, -> { where(status: "imported", activity_classification: SET_ASIDE_CLASSIFICATIONS,
    included_in_flights_at: nil, target_flight_id: nil) }

  def set_aside?
    imported? && automatically_set_aside?
  end

  def automatically_set_aside?
    SET_ASIDE_CLASSIFICATIONS.include?(activity_classification) && included_in_flights_at.nil? && target_flight_id.nil?
  end

  def needs_activity_review?
    activity_classification == "needs_review" && included_in_flights_at.nil?
  end

  def source_missing?
    activity_summary["reason"].in?(%w[source_missing source_unavailable])
  end

  def include_in_flights!
    with_lock do
      raise ExoFdr::Error, "The original source file is missing from storage." if source_missing?
      return if included_in_flights_at? && !failed?

      update!(included_in_flights_at: included_in_flights_at || Time.current)
      queue_activity_import! unless flights.exists?
    end
  end

  def queue_activity_import!
    update!(status: "pending", error_message: nil)
    raise ActiveJob::EnqueueError, "The recording could not be queued." unless ExoFdrImportJob.perform_later(self)
  end

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
