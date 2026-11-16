# A ground computer with Signal open in standby. It checks in every few seconds
# so a phone remote knows, before a flight starts, whether anything will record it.
class SignalStation < ApplicationRecord
  FRESHNESS = 10.seconds
  KEY_FORMAT = /\A[0-9a-f-]{36}\z/

  belongs_to :user

  validates :key, presence: true, uniqueness: true, format: { with: KEY_FORMAT }
  validates :device_id, :aircraft_label, length: { maximum: 120 }

  scope :online, -> { where(seen_at: FRESHNESS.ago..) }

  def self.check_in!(user:, key:, remote_enabled:, ready:, device_id: nil, aircraft_label: nil)
    station = find_or_initialize_by(key: key.to_s)
    station.update!(user:, remote_enabled:, ready:, seen_at: Time.current,
      device_id: device_id.presence&.first(120), aircraft_label: aircraft_label.presence&.first(120))
    station
  rescue ActiveRecord::RecordNotUnique
    retry
  end

  # The station a phone should expect to record its next flight: its own
  # operator's first, then one that is ready, then the most recent.
  def self.for_remote(user)
    online.max_by { |station| [ station.user_id == user.id ? 1 : 0, station.remote_enabled ? 1 : 0, station.ready ? 1 : 0, station.seen_at ] }
  end

  def remote_state
    return "remote_off" unless remote_enabled

    ready ? "ready" : "waiting"
  end
end
