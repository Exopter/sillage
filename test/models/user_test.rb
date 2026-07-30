require "test_helper"

class UserTest < ActiveSupport::TestCase
  test "normalizes email addresses" do
    user = User.new(email_address: "  New.User@EXOPTER.COM ", role: "user")
    user.valid?

    assert_equal "new.user@exopter.com", user.email_address
  end

  test "validates roles" do
    user = users(:operator)
    user.role = "owner"

    assert_not user.valid?
  end

  test "accepts eight character passwords" do
    user = users(:invited)

    assert user.accept_invitation!(password: "passw0rd", password_confirmation: "passw0rd")
  end

  test "rejects passwords shorter than eight characters" do
    user = users(:invited)

    assert_not user.accept_invitation!(password: "short7", password_confirmation: "short7")
    assert_includes user.errors[:password], "is too short (minimum is 8 characters)"
  end

  test "invitation token is invalidated after acceptance" do
    user = users(:invited)
    token = user.invitation_token

    assert_equal user, User.find_by_token_for(:invitation, token)

    assert user.accept_invitation!(password: "password123456", password_confirmation: "password123456")

    assert_nil User.find_by_token_for(:invitation, token)
  end

  test "password reset token is invalidated after password change" do
    user = users(:operator)
    token = user.password_reset_token

    assert_equal user, User.find_by_password_reset_token(token)

    user.update!(password: "new-password-123456", password_confirmation: "new-password-123456")

    assert_nil User.find_by_password_reset_token(token)
  end

  test "verifies totp codes against the encrypted secret" do
    user = users(:julien)
    secret = ROTP::Base32.random_base32
    user.enable_totp!(secret)
    code = ROTP::TOTP.new(secret, issuer: "Sillage").now

    assert_not_equal secret, user.otp_secret_ciphertext
    assert user.verify_totp(code)
    assert_not user.verify_totp("000000")
  end

  test "disabled users are not active for authentication" do
    user = users(:operator)

    assert user.active_for_authentication?

    user.update!(disabled_at: Time.current)

    assert_not user.active_for_authentication?
  end
end
