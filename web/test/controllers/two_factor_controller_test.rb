require "test_helper"

class TwoFactorControllerTest < ActionDispatch::IntegrationTest
  test "requires admin challenge before accessing the app" do
    user = users(:julien)
    secret = ROTP::Base32.random_base32
    user.enable_totp!(secret)
    sign_in_as user, otp_verified: false

    get root_path

    assert_redirected_to new_two_factor_challenge_path

    post two_factor_challenge_path, params: { otp_code: ROTP::TOTP.new(secret, issuer: "Exopter OS").now }

    assert_redirected_to root_path
  end

  test "shows setup for admins without configured totp" do
    user = users(:julien)
    user.reset_totp!
    sign_in_as user, otp_verified: false

    get new_two_factor_setup_path

    assert_response :success
    assert_select ".totp-qr svg"
  end
end
