# Live data is a short-lived mailbox; Signal remains responsible for durable capture.
class FdrLiveTelemetry
  LEASE = 15.seconds
  FRESHNESS = 2.seconds

  def self.wanted?(recorder)
    Rails.cache.read("fdr-live/lease/#{recorder.device_id}").present?
  end

  def self.poll(recorder)
    Rails.cache.write("fdr-live/lease/#{recorder.device_id}", true, expires_in: LEASE)
    packet = Rails.cache.read("fdr-live/packet/#{recorder.device_id}")
    packet&.merge(age_ms: [ ((Time.current - Time.iso8601(packet.fetch(:received_at))) * 1000).round, 0 ].max)
  end

  def self.publish(recorder, hex)
    return false unless hex.is_a?(String) && hex.match?(/\A[0-9a-f]{16,1024}\z/) && hex.length.even?

    Rails.cache.write("fdr-live/packet/#{recorder.device_id}",
      { packet: hex, received_at: Time.current.iso8601(6) }, expires_in: FRESHNESS)
    true
  end
end
