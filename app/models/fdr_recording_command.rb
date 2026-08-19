class FdrRecordingCommand < ApplicationRecord
  STATUSES = %w[pending acknowledged failed superseded].freeze

  belongs_to :embedded_device
  belongs_to :requested_by, class_name: "User"

  validates :requested_enabled, inclusion: { in: [ true, false ] }
  validates :status, inclusion: { in: STATUSES }

  scope :recent, -> { order(id: :desc) }
  scope :pending, -> { where(status: "pending") }

  def acknowledge!(result:, at: Time.current)
    update!(
      status: result.zero? ? "acknowledged" : "failed",
      result:,
      acknowledged_at: at
    )
  end
end
