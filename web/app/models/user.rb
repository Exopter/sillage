require "rotp"

class User < ApplicationRecord
  ROLES = %w[admin user].freeze
  DEFAULT_ADMIN_EMAIL = "julien@exopter.com"

  has_secure_password validations: false, reset_token: { expires_in: 30.minutes }

  has_many :sessions, dependent: :destroy
  has_many :flight_imports, dependent: :restrict_with_error

  normalizes :email_address, with: ->(email) { email.to_s.strip.downcase }

  generates_token_for :invitation, expires_in: 14.days do
    [ email_address, invitation_sent_at&.to_i, invitation_accepted_at&.to_i ]
  end

  validates :email_address, presence: true, uniqueness: { case_sensitive: false }
  validates :email_address, format: { with: URI::MailTo::EMAIL_REGEXP }, allow_blank: true
  validates :role, inclusion: { in: ROLES }
  validates :password, length: { minimum: 8 }, allow_nil: true
  validate :accepted_users_have_password_digest

  scope :active, -> { where(disabled_at: nil) }
  scope :admins, -> { where(role: "admin") }

  def self.default_admin
    find_or_create_by!(email_address: DEFAULT_ADMIN_EMAIL) do |user|
      user.role = "admin"
      user.invitation_sent_at = Time.current
    end
  end

  def self.invite!(email_address:, role:)
    user = find_or_initialize_by(email_address:)
    user.role = role
    user.disabled_at = nil
    user.send_invitation!
    user
  end

  def admin?
    role == "admin"
  end

  def disabled?
    disabled_at.present?
  end

  def invitation_pending?
    invitation_accepted_at.blank?
  end

  def active_for_authentication?
    !disabled? && password_digest.present? && invitation_accepted_at.present?
  end

  def send_invitation!
    self.invitation_sent_at = Time.current
    save!
    UserMailer.invitation(self).deliver_later
  end

  def accept_invitation!(password:, password_confirmation:)
    self.password = password
    self.password_confirmation = password_confirmation
    self.invitation_accepted_at = Time.current
    save
  end

  def invitation_token
    generate_token_for(:invitation)
  end

  def totp_required?
    admin?
  end

  def totp_configured?
    otp_secret_ciphertext.present? && otp_enabled_at.present?
  end

  def totp_secret
    return if otp_secret_ciphertext.blank?

    self.class.totp_encryptor.decrypt_and_verify(otp_secret_ciphertext)
  rescue ActiveSupport::MessageEncryptor::InvalidMessage, ActiveSupport::MessageVerifier::InvalidSignature
    nil
  end

  def totp_secret=(secret)
    self.otp_secret_ciphertext = secret.present? ? self.class.totp_encryptor.encrypt_and_sign(secret) : nil
  end

  def provisioning_uri(secret = totp_secret)
    ROTP::TOTP.new(secret, issuer: "Sillage").provisioning_uri(email_address)
  end

  def verify_totp(code, secret: totp_secret)
    return false if code.blank? || secret.blank?

    ROTP::TOTP.new(secret, issuer: "Sillage").verify(code.to_s.delete(" "), drift_behind: 30, drift_ahead: 30).present?
  end

  def enable_totp!(secret)
    update!(totp_secret: secret, otp_enabled_at: Time.current)
  end

  def reset_totp!
    update!(totp_secret: nil, otp_enabled_at: nil, otp_last_verified_at: nil)
    sessions.update_all(otp_verified_at: nil)
  end

  def record_totp_verification!
    update!(otp_last_verified_at: Time.current)
  end

  def self.totp_encryptor
    secret = Rails.application.key_generator.generate_key("sillage totp secret", 32)
    ActiveSupport::MessageEncryptor.new(secret)
  end

  private

  def accepted_users_have_password_digest
    return unless invitation_accepted_at.present? && password_digest.blank?

    errors.add(:password, :blank)
  end
end
