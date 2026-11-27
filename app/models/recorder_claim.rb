require "base64"

# First claim of a Lite recorder from the mobile app. The key is generated here,
# returned once to the app, which installs it on the recorder over Bluetooth while
# the recorder's pairing window is open, then confirms the claim.
class RecorderClaim < ApplicationRecord
  VALIDITY = 10.minutes
  KEY_ENCRYPTION_PURPOSE = "sillage recorder claim key v1"

  class Conflict < StandardError; end
  class Expired < StandardError; end

  belongs_to :embedded_controller
  belongs_to :user
  belongs_to :recorder_ownership, optional: true

  validates :token, presence: true, uniqueness: true
  validates :expires_at, presence: true

  # Returns the claim and the raw key. Raises Conflict when the recorder already
  # has an owner or a key installed outside the app.
  def self.open!(user:, embedded_controller:, at: Time.current)
    embedded_controller.with_lock do
      raise Conflict if embedded_controller.app_owned? || embedded_controller.initialized?

      key = SecureRandom.random_bytes(EmbeddedController::FDR_AUTH_KEY_BYTES)
      claim = create!(
        user:, embedded_controller:, token: SecureRandom.uuid, expires_at: at + VALIDITY,
        key_ciphertext: encryptor.encrypt_and_sign(Base64.strict_encode64(key), purpose: KEY_ENCRYPTION_PURPOSE)
      )
      [ claim, key ]
    end
  end

  def self.encryptor
    EmbeddedController.fdr_auth_encryptor
  end

  def expired?(at: Time.current)
    expires_at <= at
  end

  # Links the recorder to the claiming account and makes the key the recorder's
  # authentication key. Confirming the same claim twice returns the ownership.
  def confirm!(name:, at: Time.current)
    embedded_controller.with_lock do
      lock!
      return recorder_ownership if confirmed_at && recorder_ownership&.unlinked_at.nil?
      raise Expired if confirmed_at || expired?(at:)
      raise Conflict if embedded_controller.app_owned? || embedded_controller.initialized?

      ownership = embedded_controller.recorder_ownerships.create!(
        user:, linked_at: at,
        name: name.to_s.strip.presence || RecorderOwnership.default_name(embedded_controller.device_id)
      )
      embedded_controller.install_fdr_auth_key!(key, at:)
      update!(confirmed_at: at, recorder_ownership: ownership, key_ciphertext: nil)
      embedded_controller.record_activity!("app_linked", source: "mobile_app", actor: user, occurred_at: at)
      ownership
    end
  end

  private

  def key
    Base64.strict_decode64(self.class.encryptor.decrypt_and_verify(key_ciphertext, purpose: KEY_ENCRYPTION_PURPOSE))
  end
end
