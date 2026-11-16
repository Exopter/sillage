require "test_helper"

class InvitationsControllerTest < ActionDispatch::IntegrationTest
  test "accepts an invitation and starts a session" do
    user = users(:invited)
    token = user.invitation_token

    get edit_invitation_path(token)
    assert_response :success

    patch invitation_path(token), params: {
      password: "password123456",
      password_confirmation: "password123456"
    }

    assert_redirected_to root_path
    assert user.reload.invitation_accepted_at
    assert user.authenticate("password123456")
  end
  test "existing member signs in with their current password before the welcome" do
    user = users(:member)
    get edit_invitation_path(user.invitation_token)
    assert_redirected_to new_session_path
    follow_redirect!
    assert_response :success
    assert_select "input[autocomplete='new-password']", count: 0

    post session_path, params: { email_address: user.email_address, password: "password123456" }
    assert_redirected_to flight_club_welcome_path
    follow_redirect!
    assert_response :success
  end

  test "existing invitation cannot replace an accepted account password" do
    user = users(:member)
    original_digest = user.password_digest
    original_acceptance = user.invitation_accepted_at
    assert_no_difference "Session.count" do
      patch invitation_path(user.invitation_token), params: {
        password: "replacement123456", password_confirmation: "replacement123456"
      }
    end
    assert_redirected_to new_session_path
    assert_equal original_digest, user.reload.password_digest
    assert_equal original_acceptance, user.invitation_accepted_at
  end

  test "signed-in existing member opens their welcome directly" do
    user = users(:member)
    sign_in_as user
    get edit_invitation_path(user.invitation_token)
    assert_redirected_to flight_club_welcome_path
  end

  test "another signed-in account must authenticate as the invited existing member" do
    sign_in_as users(:julien)
    get edit_invitation_path(users(:member).invitation_token)
    assert_redirected_to new_session_path
  end

  test "existing nonmember returns to the app without setting a new password" do
    user = users(:operator)
    sign_in_as user
    get edit_invitation_path(user.invitation_token)
    assert_redirected_to root_path
  end
  test "existing admin still verifies two-factor authentication before the member welcome" do
    user = users(:member)
    user.update!(role: "admin")
    secret = ROTP::Base32.random_base32
    user.enable_totp!(secret)

    get edit_invitation_path(user.invitation_token)
    assert_redirected_to new_session_path
    post session_path, params: { email_address: user.email_address, password: "password123456" }
    assert_redirected_to new_two_factor_challenge_path
    post two_factor_challenge_path, params: { otp_code: ROTP::TOTP.new(secret).now }
    assert_redirected_to flight_club_welcome_path
    follow_redirect!
    assert_response :success
  end
end
