require "base64"

class EmbeddedDevice < ApplicationRecord
  DEVICE_ID_PATTERN = FdrIdentity::DeviceId::PATTERN
  FDR_AUTH_KEY_BYTES = 32
  FDR_AUTH_ENCRYPTION_PURPOSE = "sillage fdr authentication key v1"

  class AuthenticationKeyError < StandardError; end

  belongs_to :assembly, optional: true, inverse_of: :embedded_device
  has_one :signal_presence, dependent: :destroy
  has_many :fdr_wifi_profiles, -> { ordered }, dependent: :destroy
  has_many :fdr_wifi_uploads, dependent: :restrict_with_error
  has_many :fdr_recording_commands, dependent: :restrict_with_error
  has_many :wifi_credentials, through: :fdr_wifi_profiles
  has_many :device_activities, -> { recent }, dependent: :restrict_with_error

  normalizes :device_id, with: ->(identifier) { FdrIdentity::DeviceId.normalize(identifier) }
  normalizes :device_model, :last_seen_firmware, with: ->(value) { value.to_s.strip.presence }

  validates :assembly_id, uniqueness: true, allow_nil: true
  validates :device_id, uniqueness: true, allow_nil: true, length: { maximum: 64 }
  validates :device_id, format: { with: DEVICE_ID_PATTERN }, allow_nil: true
  validates :device_model, :last_seen_firmware, length: { maximum: 128 }, allow_nil: true
  validates :mavlink_system_id, :mavlink_component_id,
    inclusion: { in: 1..255 }, allow_nil: true
  validate :mavlink_component_requires_system

  scope :ordered, -> { left_joins(:assembly).order(Arel.sql("device_id IS NULL, device_id, assemblies.internal_number")) }

  def display_name
    assembly&.name.presence || device_id.presence || "Unassigned FDR"
  end

  def technical_reference
    device_id.presence || assembly&.internal_number.presence || "Not identified"
  end

  def active_installation
    assembly&.installations&.active&.includes(:aircraft)&.recent&.first
  end

  def aircraft
    active_installation&.aircraft
  end

  def mavlink_identity
    return {} unless mavlink_system_id

    { "system_id" => mavlink_system_id, "component_id" => mavlink_component_id }.compact
  end

  def mavlink_identity_label
    return unless mavlink_system_id

    [ "System #{mavlink_system_id}", ("component #{mavlink_component_id}" if mavlink_component_id) ].compact.join(" · ")
  end

  def snapshot
    {
      "device_id" => device_id,
      "model" => device_model,
      "firmware" => last_seen_firmware,
      "mavlink" => mavlink_identity
    }
  end

  def initialized?
    fdr_auth_key_installed_at.present?
  end

  def ensure_fdr_auth_key!
    with_lock do
      existing = fdr_auth_key
      return existing if existing.present?

      key = SecureRandom.random_bytes(FDR_AUTH_KEY_BYTES)
      encrypted = self.class.fdr_auth_encryptor.encrypt_and_sign(
        Base64.strict_encode64(key),
        purpose: FDR_AUTH_ENCRYPTION_PURPOSE
      )
      update!(fdr_auth_key_ciphertext: encrypted)
      key
    end
  end

  def fdr_auth_key
    return if fdr_auth_key_ciphertext.blank?

    encoded_key = self.class.fdr_auth_encryptor.decrypt_and_verify(
      fdr_auth_key_ciphertext,
      purpose: FDR_AUTH_ENCRYPTION_PURPOSE
    )
    Base64.strict_decode64(encoded_key)
  rescue ActiveSupport::MessageEncryptor::InvalidMessage,
         ActiveSupport::MessageVerifier::InvalidSignature,
         ArgumentError => error
    raise AuthenticationKeyError, "The recorder authentication key cannot be decrypted.", cause: error
  end

  def fdr_auth_key_encoded
    [ ensure_fdr_auth_key! ].pack("m0").tr("+/", "-_").delete("=")
  end

  def record_activity!(event_type, source:, actor: nil, details: {}, occurred_at: Time.current)
    device_activities.create!(event_type:, source:, actor:, details:, occurred_at:)
  end

  def self.fdr_auth_encryptor
    secret = Rails.application.key_generator.generate_key(
      "sillage fdr authentication keys",
      32
    )
    ActiveSupport::MessageEncryptor.new(secret, cipher: "aes-256-gcm")
  end

  private

  def mavlink_component_requires_system
    return if mavlink_component_id.nil? || mavlink_system_id.present?

    errors.add(:mavlink_system_id, "must be set when a MAVLink component ID is present")
  end
end
