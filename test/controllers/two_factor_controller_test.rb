require "test_helper"

class TwoFactorControllerTest < ActionDispatch::IntegrationTest
  test "requires admin challenge before accessing the app" do
    user = users(:julien)
    secret = ROTP::Base32.random_base32
    user.enable_totp!(secret)
    sign_in_as user, otp_verified: false

    get root_path

    assert_redirected_to new_two_factor_challenge_path

    post two_factor_challenge_path, params: { otp_code: ROTP::TOTP.new(secret, issuer: "Sillage").now }

    assert_redirected_to root_path
  end

  test "shows setup for admins without configured totp" do
    user = users(:julien)
    user.reset_totp!
    sign_in_as user, otp_verified: false

    get new_two_factor_setup_path

    assert_response :success
    assert_select ".totp-qr img[src^='data:image/svg+xml;base64,']"
    assert_select ".totp-secret span", text: "Manual setup key"
    assert_select ".totp-secret code", text: /[A-Z2-7]{16,}/
  end
  test "background API polling cannot replace the two-factor return page" do
    user = users(:julien)
    secret = ROTP::Base32.random_base32
    user.enable_totp!(secret)
    sign_in_as user, otp_verified: false

    get flights_path
    assert_redirected_to new_two_factor_challenge_path
    get api_v1_fdr_sillage_heartbeats_path, as: :json
    assert_response :forbidden
    assert_nil response.headers["Location"]
    get api_v1_fdr_sillage_heartbeats_path
    assert_response :forbidden

    post two_factor_challenge_path, params: { otp_code: ROTP::TOTP.new(secret).now }
    assert_redirected_to flights_path
  end

  test "unauthenticated API polling does not redirect or replace the sign-in return page" do
    get api_v1_fdr_sillage_heartbeats_path, as: :json
    assert_response :unauthorized
    assert_nil response.headers["Location"]

    sign_in_as users(:operator)
    assert_redirected_to root_path
  end

  test "admin can sign out from the challenge before verification" do
    user = users(:julien)
    user.enable_totp!(ROTP::Base32.random_base32)
    session_record = sign_in_as user, otp_verified: false
    get new_two_factor_challenge_path
    assert_response :success
    assert_select "form[action='#{session_path}']" do
      assert_select "input[name='_method'][value='delete']"
      assert_select "button", text: "Sign out"
    end

    delete session_path
    assert_redirected_to new_session_path
    assert_not Session.exists?(session_record.id)
    get root_path
    assert_redirected_to new_session_path
  end

  test "admin can sign out from setup before enabling two-factor authentication" do
    user = users(:julien)
    user.reset_totp!
    session_record = sign_in_as user, otp_verified: false
    get new_two_factor_setup_path
    assert_response :success
    assert_select "form[action='#{session_path}'] button", text: "Sign out"

    delete session_path
    assert_redirected_to new_session_path
    assert_not Session.exists?(session_record.id)
  end

  test "discards previously stored API return paths after verification" do
    controller = SessionsController.new
    controller.request = ActionDispatch::TestRequest.create
    stored_session = {
      return_to_after_two_factor: "/api/v1/fdr-sillage-heartbeats",
      return_to_after_authenticating: "/flights?view=list"
    }
    controller.define_singleton_method(:session) { stored_session }

    assert_equal "/flights?view=list", controller.send(:after_two_factor_url)
    assert_empty stored_session
  end

  test "falls back to the home page when all stored return paths point to APIs" do
    controller = SessionsController.new
    controller.request = ActionDispatch::TestRequest.create
    stored_session = { return_to_after_authenticating: "/api/v1/fdr-sillage-heartbeats" }
    controller.define_singleton_method(:session) { stored_session }

    assert_equal "/", controller.send(:after_authentication_url)
    assert_empty stored_session
  end
end
