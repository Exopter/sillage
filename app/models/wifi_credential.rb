class WifiCredential < ApplicationRecord
  SECURITIES = %w[open wpa wpa2 wpa_wpa2 wpa3 wpa2_wpa3].freeze
  SECURITY_CODES = {
    "open" => 0,
    "wpa" => 2,
    "wpa2" => 3,
    "wpa_wpa2" => 4,
    "wpa3" => 6,
    "wpa2_wpa3" => 7
  }.freeze
  ENCRYPTION_PURPOSE = "sillage wifi credential v1"

  class DecryptionError < StandardError; end

  belongs_to :created_by, class_name: "User", inverse_of: :created_wifi_credentials
  has_many :fdr_wifi_profiles, dependent: :restrict_with_error
  has_many :embedded_devices, through: :fdr_wifi_profiles

  before_validation :prepare_open_network_password
  before_save :encrypt_pending_password
  after_save :forget_pending_password

  validates :ssid, presence: true, uniqueness: true
  validates :security, inclusion: { in: SECURITIES }
  validate :ssid_is_valid_wifi_name
  validate :password_matches_security

  scope :ordered, -> { order(Arel.sql("LOWER(ssid)")) }

  attr_reader :password

  def password=(value)
    @password = value.to_s
    @password_assigned = true
  end

  def password_assigned?
    @password_assigned == true
  end

  def provisioning_password
    return "" if security == "open" && password_ciphertext.blank?

    self.class.encryptor.decrypt_and_verify(password_ciphertext, purpose: ENCRYPTION_PURPOSE)
  rescue ActiveSupport::MessageEncryptor::InvalidMessage, ActiveSupport::MessageVerifier::InvalidSignature => error
    raise DecryptionError, "The saved Wi-Fi password cannot be decrypted.", cause: error
  end

  def security_code
    SECURITY_CODES.fetch(security)
  end

  def security_label
    {
      "open" => "Open",
      "wpa" => "WPA",
      "wpa2" => "WPA2",
      "wpa_wpa2" => "WPA/WPA2",
      "wpa3" => "WPA3",
      "wpa2_wpa3" => "WPA2/WPA3"
    }.fetch(security)
  end

  def self.encryptor
    secret = Rails.application.key_generator.generate_key("sillage wifi credentials", 32)
    ActiveSupport::MessageEncryptor.new(secret, cipher: "aes-256-gcm")
  end

  private

  def prepare_open_network_password
    self.password = "" if security == "open" && !password_assigned?
  end

  def encrypt_pending_password
    return unless password_assigned?

    self.password_ciphertext = self.class.encryptor.encrypt_and_sign(password, purpose: ENCRYPTION_PURPOSE)
  end

  def forget_pending_password
    @password = nil
    @password_assigned = false
  end

  def ssid_is_valid_wifi_name
    bytes = ssid.to_s.b
    return if ssid.to_s.valid_encoding? && bytes.bytesize.between?(1, 32) && !bytes.bytes.include?(0)

    errors.add(:ssid, "must be a valid Wi-Fi name of 1 to 32 bytes")
  end

  def password_matches_security
    if security == "open"
      errors.add(:password, "must be empty for an open network") if password_assigned? && password.present?
    elsif (new_record? || will_save_change_to_security?) && !password_assigned?
      errors.add(:password, "is required")
    elsif password_assigned? && !password.b.bytesize.between?(8, 63)
      errors.add(:password, "must be between 8 and 63 bytes")
    end
  end
end
