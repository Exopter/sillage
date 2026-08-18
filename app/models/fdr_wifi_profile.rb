class FdrWifiProfile < ApplicationRecord
  MAX_PROFILES = 5

  belongs_to :embedded_device
  belongs_to :wifi_credential

  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than: MAX_PROFILES }
  validates :position, uniqueness: { scope: :embedded_device_id }
  validates :wifi_credential_id, uniqueness: { scope: :embedded_device_id }
  validate :device_profile_limit, on: :create

  scope :ordered, -> { order(:position) }

  delegate :ssid, :security, :security_code, :security_label, to: :wifi_credential

  def pending?
    return true if last_provisioned_at.blank?

    updated_at > last_provisioned_at || wifi_credential.updated_at > last_provisioned_at
  end

  private

  def device_profile_limit
    return unless embedded_device&.fdr_wifi_profiles&.count.to_i >= MAX_PROFILES

    errors.add(:base, "A recorder can store at most #{MAX_PROFILES} Wi-Fi networks.")
  end
end
