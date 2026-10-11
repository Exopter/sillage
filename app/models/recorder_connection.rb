# Browser observations describe connectivity only. They never authorize recorder commands.
class RecorderConnection < ApplicationRecord
  FRESHNESS = 15.seconds
  TRANSPORTS = %w[usb-c ble ground-radio].freeze

  belongs_to :embedded_controller
  belongs_to :user

  validates :transport, inclusion: { in: TRANSPORTS }
  validates :observer_id, format: { with: /\A[0-9a-f-]{36}\z/ }
  validates :last_seen_at, presence: true

  def fresh?(at: Time.current)
    last_seen_at >= at - FRESHNESS
  end
end
