require "base64"

class Assembly < ApplicationRecord
  include AssetIdentifiable

  ASSET_IDENTIFIER_PREFIX = "ASY"
  DEVICE_ID_PATTERN = /\AEXOFDR-[0-9A-F]{6}\z/
  FDR_AUTH_KEY_BYTES = 32
  FDR_AUTH_ENCRYPTION_PURPOSE = "sillage fdr authentication key v1"

  class AuthenticationKeyError < StandardError; end

  belongs_to :parent, class_name: "Assembly", optional: true, inverse_of: :children
  has_many :children, class_name: "Assembly", foreign_key: :parent_id,
    inverse_of: :parent, dependent: :restrict_with_error
  has_many :parts, dependent: :restrict_with_error
  has_many :builds, dependent: :restrict_with_error
  has_many :installations, as: :installable, dependent: :restrict_with_error
  has_many :fdr_wifi_profiles, -> { ordered }, dependent: :destroy
  has_many :wifi_credentials, through: :fdr_wifi_profiles

  normalizes :internal_number, with: ->(number) { number.to_s.strip.upcase.presence }
  normalizes :device_id, with: ->(identifier) { identifier.to_s.strip.upcase.presence }
  normalizes :device_model, :last_seen_firmware, with: ->(value) { value.to_s.strip.presence }

  validates :name, presence: true
  validates :internal_number, uniqueness: true, allow_nil: true
  validates :internal_number, format: { with: /\AASY-\d{6,}\z/ }, allow_nil: true
  validates :device_id, uniqueness: true, allow_nil: true, length: { maximum: 64 }
  validates :device_id, format: { with: DEVICE_ID_PATTERN }, allow_nil: true
  validates :device_model, :last_seen_firmware, length: { maximum: 128 }, allow_nil: true
  validates :mavlink_system_id, :mavlink_component_id,
    inclusion: { in: 1..255 }, allow_nil: true
  validate :mavlink_component_requires_system
  validate :parent_does_not_create_cycle
  validate :parent_does_not_conflict_with_aircraft_installation

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:internal_number) }

  def snapshot
    {
      "internal_number" => internal_number,
      "name" => name,
      "device_id" => device_id,
      "mavlink" => mavlink_identity,
      "parts" => parts.includes(:function).ordered.map do |part|
        {
          "internal_number" => part.internal_number,
          "function" => part.function.name,
          "function_code" => part.function.code,
          "manufacturer" => part.manufacturer,
          "model" => part.model,
          "serial_number" => part.serial_number
        }
      end,
      "assemblies" => children.ordered.map(&:snapshot)
    }
  end

  def mavlink_identity
    return {} unless mavlink_system_id

    { "system_id" => mavlink_system_id, "component_id" => mavlink_component_id }.compact
  end

  def mavlink_identity_label
    return unless mavlink_system_id

    [ "System #{mavlink_system_id}", ("component #{mavlink_component_id}" if mavlink_component_id) ].compact.join(" · ")
  end

  def descendant_ids
    children.flat_map { |child| [ child.id, *child.descendant_ids ] }
  end

  def contains_part?(part)
    snapshot_part_numbers.include?(part.internal_number)
  end

  def snapshot_part_numbers
    own = parts.pluck(:internal_number)
    own + children.flat_map(&:snapshot_part_numbers)
  end

  def flight_data_recorder?
    return true if device_id.present?

    function_codes = parts.joins(:function).distinct.pluck("functions.code")
    function_codes.include?("CONTROLLER") && function_codes.include?("STORAGE")
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

  def self.fdr_auth_encryptor
    secret = Rails.application.key_generator.generate_key(
      "sillage fdr authentication keys",
      32
    )
    ActiveSupport::MessageEncryptor.new(secret, cipher: "aes-256-gcm")
  end

  def deletion_blockers
    [].tap do |blockers|
      blockers << "installed parts" if parts.exists?
      blockers << "subassemblies" if children.exists?
      blockers << "build history" if builds.exists?
      blockers << "installation history" if installations.exists?
    end
  end

  private

  def mavlink_component_requires_system
    return if mavlink_component_id.nil? || mavlink_system_id.present?

    errors.add(:mavlink_system_id, "must be set when a MAVLink component ID is present")
  end

  def parent_does_not_create_cycle
    return if parent.nil?

    errors.add(:parent, "cannot be the assembly itself") if parent == self
    errors.add(:parent, "cannot be one of its descendants") if persisted? && descendant_ids.include?(parent_id)
  end

  def parent_does_not_conflict_with_aircraft_installation
    return unless parent_id.present? && installations.active.exists?

    errors.add(:parent, "cannot be set while the assembly is installed on an aircraft")
  end
end
