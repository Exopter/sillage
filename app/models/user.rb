require "rotp"
require "digest"

class User < ApplicationRecord
  ROLES = %w[admin operator user].freeze
  # `core_team` is the Exopter team edition; the other tiers are client memberships.
  MEMBERSHIP_TIERS = %w[pioneer explorer pathfinder trailblazer core_team].freeze
  MEMBER_NUMBER_SEQUENCE = "flight_club_member"
  INVITATION_VALIDITY = 14.days
  AVATAR_TYPES = %w[image/jpeg image/png image/webp].freeze
  MAX_AVATAR_SIZE = 5.megabytes
  DEFAULT_ADMIN_EMAIL = "julien@exopter.com"
  # A pilot's preferred setup, edited from their profile or by an admin in Core.
  WING_SETTING_RANGES = {
    weight_kg: 30..200,
    height_cm: 120..230,
    cg_setting: -10..10,
    tunnel_glide_ratio: Flight::TUNNEL_GLIDE_RATIOS,
    tunnel_speed_kmh: 50..300
  }.freeze
  WING_SETTINGS = WING_SETTING_RANGES.keys.freeze

  has_secure_password validations: false, reset_token: { expires_in: 30.minutes }
  has_one_attached :avatar

  has_many :sessions, dependent: :destroy
  has_many :feedbacks, dependent: :restrict_with_error
  has_many :flight_imports, dependent: :restrict_with_error
  has_many :flights, dependent: :restrict_with_error
  has_many :piloted_flights, class_name: "Flight", foreign_key: :pilot_id,
    inverse_of: :pilot, dependent: :restrict_with_error
  has_many :flight_comments, dependent: :restrict_with_error
  has_many :flight_folders, dependent: :destroy
  has_many :flight_folder_memberships, dependent: :destroy
  has_many :signal_sessions, dependent: :restrict_with_error
  has_many :created_wifi_credentials,
    class_name: "WifiCredential", foreign_key: :created_by_id,
    inverse_of: :created_by, dependent: :restrict_with_error
  has_many :device_activities, foreign_key: :actor_id, dependent: :restrict_with_error

  normalizes :email_address, with: ->(email) { email.to_s.strip.downcase }

  generates_token_for :invitation, expires_in: INVITATION_VALIDITY do
    [ email_address, invitation_sent_at&.to_i, invitation_accepted_at&.to_i ]
  end

  validates :email_address, presence: true, uniqueness: { case_sensitive: false }
  validates :email_address, format: { with: URI::MailTo::EMAIL_REGEXP }, allow_blank: true
  validates :role, inclusion: { in: ROLES }
  validates :password, length: { minimum: 8 }, allow_nil: true
  validates :membership_tier, inclusion: { in: MEMBERSHIP_TIERS }, allow_nil: true
  validates :first_name, :last_name, presence: true, if: :member?
  validates :member_number, uniqueness: true, allow_nil: true, unless: -> { membership_tier == "core_team" && member_number == 0 }
  validates :member_number, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, allow_nil: true
  validate :zero_member_number_requires_core_team
  WING_SETTING_RANGES.each do |setting, range|
    validates setting, numericality: { greater_than_or_equal_to: range.min, less_than_or_equal_to: range.max }, allow_nil: true
  end
  validates :height_cm, :tunnel_speed_kmh, numericality: { only_integer: true }, allow_nil: true

  normalizes :first_name, :last_name, with: ->(name) { name.to_s.squish.presence }
  normalizes :membership_tier, with: ->(tier) { tier.presence }

  before_validation :assign_member_number, if: -> { member? && member_number.nil? }
  before_save :stamp_wing_settings, if: -> { WING_SETTINGS.any? { |setting| will_save_change_to_attribute?(setting) } }
  validate :accepted_users_have_password_digest
  validate :validate_avatar

  scope :active, -> { where(disabled_at: nil) }
  # An invited user can be given flights before accepting the invitation.
  scope :available_as_pilot, -> { active }
  scope :available_for_sharing, -> {
    active.where("invitation_accepted_at IS NOT NULL OR invitation_sent_at >= ?", INVITATION_VALIDITY.ago)
  }
  scope :admins, -> { where(role: "admin") }

  def self.default_admin
    find_or_create_by!(email_address: DEFAULT_ADMIN_EMAIL) do |user|
      user.role = "admin"
      user.invitation_sent_at = Time.current
    end
  end

  def self.invite!(email_address:, role:, **profile)
    user = find_or_initialize_by(email_address:)
    user.role = role
    user.assign_attributes(profile.slice(:first_name, :last_name, :membership_tier))
    user.disabled_at = nil
    user.send_invitation!
    user
  end

  def admin?
    role == "admin"
  end

  def operations_access?
    admin? || role == "operator"
  end

  def disabled?
    disabled_at.present?
  end

  def member?
    membership_tier.present?
  end

  def signal_access?
    operations_access? || !member?
  end

  def wing_settings?
    WING_SETTINGS.any? { |setting| self[setting].present? }
  end

  def full_name
    [ first_name, last_name ].compact_blank.join(" ").presence
  end

  def membership_rank
    membership_tier&.titleize
  end

  # "a Pioneer", "an Explorer", "part of the Core Team".
  def membership_rank_phrase
    return unless member?
    return "part of the Core Team" if membership_tier == "core_team"

    "#{membership_rank.match?(/\A[AEIOU]/) ? "an" : "a"} #{membership_rank}"
  end

  def membership_status
    { "pioneer" => "Founding member", "core_team" => "Team member" }.fetch(membership_tier, "Member") if member?
  end

  # Member numbers are permanent: a number is never reassigned or renumbered.
  def member_code
    format("Member %04d", member_number) if member_number
  end

  def awaiting_membership_welcome?
    member? && membership_welcomed_at.nil?
  end

  def complete_membership_welcome!
    update!(membership_welcomed_at: Time.current) if awaiting_membership_welcome?
  end

  def invitation_expires_at
    invitation_sent_at + INVITATION_VALIDITY if invitation_sent_at
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
    self.membership_started_at ||= invitation_accepted_at if member?
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

  def zero_member_number_requires_core_team
    if member_number == 0 && membership_tier != "core_team"
      errors.add(:member_number, "is reserved for Core Team")
    end
  end

  def validate_avatar
    return unless avatar.attached?

    errors.add(:avatar, "must be a JPEG, PNG or WebP image") unless AVATAR_TYPES.include?(avatar.blob.content_type)
    errors.add(:avatar, "must be 5 MB or smaller") if avatar.blob.byte_size > MAX_AVATAR_SIZE
  end

  def stamp_wing_settings
    self.wing_settings_updated_at = Time.current
  end

  def assign_member_number
    self.member_number = IdentifierSequence.next_value!(MEMBER_NUMBER_SEQUENCE)
  end

  def accepted_users_have_password_digest
    return unless invitation_accepted_at.present? && password_digest.blank?

    errors.add(:password, :blank)
  end
end
