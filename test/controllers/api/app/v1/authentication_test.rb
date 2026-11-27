require "test_helper"

module Api
  module App
    module V1
      class AuthenticationTest < ActionDispatch::IntegrationTest
        PASSWORD = "password123456".freeze

        setup { Rails.cache.clear }

        test "a member signs in with a password and reads the account" do
          user = users(:operator)

          post api_app_v1_session_path, params: { email: user.email_address.upcase, password: PASSWORD, device_name: "iPhone" }, as: :json

          assert_response :created
          body = response.parsed_body
          assert_equal user.email_address, body.dig("account", "email")
          token = body.fetch("token")
          assert_equal AppToken.digest(token), user.app_tokens.sole.token_digest

          get api_app_v1_account_path, headers: bearer(token), as: :json

          assert_response :success
          assert_equal user.id, response.parsed_body["id"]
          assert_equal "no-store", response.headers["Cache-Control"]
        end

        test "a wrong password or an invited account gets no token" do
          post api_app_v1_session_path, params: { email: users(:operator).email_address, password: "wrong" }, as: :json
          assert_response :unauthorized
          assert_equal "invalid_credentials", response.parsed_body["error"]

          post api_app_v1_session_path, params: { email: users(:invited).email_address, password: PASSWORD }, as: :json
          assert_response :unauthorized
          assert_empty AppToken.all
        end

        test "an admin exchanges the challenge and a code for a token" do
          user = users(:julien)
          secret = ROTP::Base32.random_base32
          user.enable_totp!(secret)

          post api_app_v1_session_path, params: { email: user.email_address, password: PASSWORD }, as: :json

          assert_response :success
          assert response.parsed_body["two_factor_required"]
          challenge = response.parsed_body.fetch("challenge")
          assert_empty AppToken.all

          post api_app_v1_two_factor_session_path, params: { challenge:, otp_code: "000000" }, as: :json
          assert_response :unauthorized
          assert_equal "invalid_code", response.parsed_body["error"]

          post api_app_v1_two_factor_session_path, params: { challenge:, otp_code: ROTP::TOTP.new(secret).now }, as: :json
          assert_response :created
          assert response.parsed_body["token"].present?

          # The challenge works once.
          post api_app_v1_two_factor_session_path, params: { challenge:, otp_code: ROTP::TOTP.new(secret).now }, as: :json
          assert_response :unauthorized
          assert_equal "challenge_expired", response.parsed_body["error"]
        end

        test "the challenge does not reveal the password hash" do
          user = users(:julien)
          user.enable_totp!(ROTP::Base32.random_base32)

          post api_app_v1_session_path, params: { email: user.email_address, password: PASSWORD }, as: :json

          decoded = Base64.urlsafe_decode64(response.parsed_body["challenge"].split("--").first) rescue ""
          assert_not_includes response.parsed_body["challenge"] + decoded, user.password_digest
        end

        test "an admin without two-factor setup is sent to Sillage" do
          user = users(:julien)
          user.reset_totp!

          post api_app_v1_session_path, params: { email: user.email_address, password: PASSWORD }, as: :json

          assert_response :forbidden
          assert_equal "two_factor_setup_required", response.parsed_body["error"]
          assert_match %r{/two_factor/setup/new\z}, response.parsed_body["setup_url"]
        end

        test "sign-out revokes the token" do
          token = AppToken.issue!(user: users(:operator)).token

          delete api_app_v1_current_token_path, headers: bearer(token), as: :json
          assert_response :no_content

          get api_app_v1_account_path, headers: bearer(token), as: :json
          assert_response :unauthorized
        end

        test "a disabled account loses access" do
          user = users(:operator)
          token = AppToken.issue!(user:).token
          user.update!(disabled_at: Time.current)

          get api_app_v1_account_path, headers: bearer(token), as: :json

          assert_response :unauthorized
        end

        test "recorders and firmware answer for a signed-in account" do
          token = AppToken.issue!(user: users(:operator)).token

          get api_app_v1_recorders_path, headers: bearer(token), as: :json
          assert_response :success
          assert_equal [], response.parsed_body["recorders"]

          get api_app_v1_latest_firmware_path(model: "lite", current: "0.4.0"), headers: bearer(token)
          assert_response :no_content

          get api_app_v1_recorders_path, as: :json
          assert_response :unauthorized
        end

        private

        def bearer(token)
          { "Authorization" => "Bearer #{token}" }
        end
      end
    end
  end
end
