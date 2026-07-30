require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  test "redirects protected app routes to sign in" do
    get root_path

    assert_redirected_to new_session_path
  end

  test "signs in a regular user without two-factor authentication" do
    post session_path, params: {
      email_address: users(:operator).email_address,
      password: "password123456"
    }

    assert_redirected_to root_path
  end

  test "sends admins with configured totp to the two-factor challenge" do
    user = users(:julien)
    user.enable_totp!(ROTP::Base32.random_base32)

    post session_path, params: {
      email_address: user.email_address,
      password: "password123456"
    }

    assert_redirected_to new_two_factor_challenge_path
  end

  test "rejects disabled users" do
    user = users(:operator)
    user.update!(disabled_at: Time.current)

    post session_path, params: {
      email_address: user.email_address,
      password: "password123456"
    }

    assert_redirected_to new_session_path
    assert_equal "Try another email address or password.", flash[:alert]
  end
end
