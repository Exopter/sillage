# One camera clip published by the wind tunnel media portal.
class TunnelVideo < ApplicationRecord
  STATUSES = %w[pending downloading ready failed ignored].freeze
  MINIMUM_DURATION_SECONDS = 10.0
  MATCH_METHODS = %w[interval end_lag].freeze

  belongs_to :flight, optional: true
  has_one_attached :file, service: Rails.configuration.x.tunnel_video_storage_service

  validates :media_token, presence: true, uniqueness: true
  validates :filename, :source_url, :camera, :recorded_at, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :match_method, inclusion: { in: MATCH_METHODS }, allow_nil: true

  scope :unmatched, -> { where(flight_id: nil) }
  scope :ready, -> { where(status: "ready") }
  scope :playback_order, -> { order(:recorded_at, :camera) }

  # Every camera of the same portal clip.
  def clip_group
    self.class.where(flight_id:, timeslot_at:, clip_number:)
  end

  # Drops a clip that should not be shown; the row stays so a later sync does not fetch it again.
  def ignore!(reason)
    file.purge
    update!(status: "ignored", error_message: reason)
  end

  def ready?
    status == "ready" && file.attached?
  end

  # Flight timeline position of the first video frame.
  def start_elapsed_seconds
    return unless flight&.started_at

    (recorded_at - flight.started_at).round(3)
  end
end
