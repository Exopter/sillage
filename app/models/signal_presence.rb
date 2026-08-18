class SignalPresence < ApplicationRecord
  FRESHNESS = 15.seconds
  ALERT_LABELS = {
    0x01 => "GPS",
    0x02 => "IMU",
    0x04 => "Airspeed",
    0x08 => "Storage",
    0x10 => "Recording queue"
  }.freeze

  belongs_to :embedded_device

  validates :embedded_device_id, uniqueness: true

  scope :fresh, ->(since) { where(last_seen_at: since..) }
  scope :recent, -> { order(last_seen_at: :desc) }

  def fresh?(at: Time.current)
    last_seen_at.present? && last_seen_at >= at - FRESHNESS
  end

  def health_label
    flags = status_integer("alert_flags")
    return "Not reported" unless flags

    alerts = ALERT_LABELS.filter_map { |flag, label| label if (flags & flag).positive? }
    return "#{alerts.join(", ")} attention" if alerts.any?
    return "Recorder attention" if flags.positive?

    diagnostic_events = status.fetch("diagnostics", {}).values.sum do |value|
      Integer(value, exception: false).to_i
    end
    return "#{diagnostic_events} recorded diagnostic #{"event".pluralize(diagnostic_events)}" if diagnostic_events.positive?

    "Nominal"
  end

  def synchronization_label
    file_index = status_integer("last_synced_file_index")
    return "Last file FDR#{file_index.to_s.rjust(6, "0")}.BIN" if file_index&.positive?

    case status_integer("last_sync_result")
    when 0 then "No synchronization yet"
    when 1 then "Up to date"
    when 2 then "Last attempt failed"
    when 3 then "In progress"
    else "Not reported"
    end
  end

  private

  def status_integer(key)
    Integer(status[key], exception: false)
  end
end
