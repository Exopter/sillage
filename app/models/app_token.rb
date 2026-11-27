# Bearer token of the Exopter mobile app. Only the SHA-256 of the token is stored.
class AppToken < ApplicationRecord
  belongs_to :user

  # Refreshing last_used_at more often than this would write on every request.
  USE_RECORD_INTERVAL = 1.hour

  attr_reader :token

  def self.issue!(user:, device_name: nil)
    token = SecureRandom.base58(40)
    create!(user:, device_name: device_name.to_s.first(100).presence, token_digest: digest(token)).tap do |record|
      record.instance_variable_set(:@token, token)
    end
  end

  def self.authenticate(token)
    return if token.blank?

    record = includes(:user).find_by(token_digest: digest(token))
    return unless record&.user&.active_for_authentication?

    record.record_use!
    record
  end

  def self.digest(token)
    Digest::SHA256.hexdigest(token.to_s)
  end

  def record_use!
    return if last_used_at && last_used_at > USE_RECORD_INTERVAL.ago

    update_column(:last_used_at, Time.current)
  end
end
