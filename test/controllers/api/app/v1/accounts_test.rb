require "test_helper"

module Api
  module App
    module V1
      class AccountsTest < ActionDispatch::IntegrationTest
        PASSWORD = "correct horse battery".freeze
        DEVICE_ID = "ECU-0A1B2C3D4E5F".freeze

        setup { Rails.cache.clear }

        test "a pilot signs up with the user role and reads the account" do
          post api_app_v1_registration_path, params: {
            email: " Pilot@Example.com ", first_name: " Ada ", last_name: "Lindqvist", password: PASSWORD, device_name: "iPhone"
          }, as: :json

          assert_response :created
          user = User.find_by!(email_address: "pilot@example.com")
          assert_equal "user", user.role
          assert_equal "Ada", user.first_name
          assert user.active_for_authentication?
          assert_not user.member?
          assert_not user.totp_required?
          token = response.parsed_body.fetch("token")
          assert_equal({ "first_name" => "Ada", "last_name" => "Lindqvist", "email" => "pilot@example.com" },
            response.parsed_body["account"].slice("first_name", "last_name", "email"))

          get api_app_v1_account_path, headers: bearer(token), as: :json
          assert_response :success

          # The same credentials sign in afterwards.
          post api_app_v1_session_path, params: { email: "pilot@example.com", password: PASSWORD }, as: :json
          assert_response :created
        end

        test "sign-up refuses a known email address, including a pending invitation" do
          [ users(:operator), users(:invited) ].each do |existing|
            post api_app_v1_registration_path, params: {
              email: existing.email_address.upcase, first_name: "A", last_name: "B", password: PASSWORD
            }, as: :json

            assert_response :conflict
            assert_equal "email_taken", response.parsed_body["error"]
          end
          assert_nil users(:invited).reload.invitation_accepted_at
          assert_empty AppToken.all
        end

        test "sign-up reports every invalid field" do
          post api_app_v1_registration_path, params: { email: "not-an-email", first_name: " ", last_name: "", password: "short" }, as: :json

          assert_response :unprocessable_entity
          assert_equal "invalid_account", response.parsed_body["error"]
          assert_equal %w[email_address first_name last_name password].sort, response.parsed_body["fields"].sort
          assert_empty AppToken.all
        end

        test "an empty password is refused" do
          post api_app_v1_registration_path, params: { email: "pilot@example.com", first_name: "A", last_name: "B", password: "" }, as: :json

          assert_response :unprocessable_entity
          assert_includes response.parsed_body["fields"], "password"
          assert_not User.exists?(email_address: "pilot@example.com")
        end

        test "deletion needs the password" do
          user = sign_up

          delete api_app_v1_account_path, params: { password: "wrong password" }, headers: bearer(@token), as: :json

          assert_response :unauthorized
          assert_equal "invalid_password", response.parsed_body["error"]
          assert user.reload.active_for_authentication?
        end

        test "deleting an account removes the user, its recorders and its sign-ins" do
          user = sign_up
          AppToken.issue!(user:)
          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, headers: bearer(@token), as: :json
          post confirm_api_app_v1_recorder_claim_path(response.parsed_body.fetch("claim_id")), params: { name: "Helmet" },
            headers: bearer(@token), as: :json
          assert_response :success
          controller = EmbeddedController.find_by!(device_id: DEVICE_ID)

          delete api_app_v1_account_path, params: { password: PASSWORD }, headers: bearer(@token), as: :json

          assert_response :no_content
          assert_not User.exists?(user.id)
          assert_empty AppToken.where(user_id: user.id)
          assert_nil controller.reload.fdr_auth_key
          assert controller.device_activities.where(event_type: "app_unlinked").exists?
          get api_app_v1_account_path, headers: bearer(@token), as: :json
          assert_response :unauthorized

          # The recorder can be linked to another account, and the address can sign up again.
          other = AppToken.issue!(user: users(:operator)).token
          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, headers: bearer(other), as: :json
          assert_response :created
          sign_up
        end

        test "an account named on another account's flight stays as an anonymous placeholder" do
          user = sign_up
          flight = flights(:one)
          flight.update_columns(pilot_id: user.id)
          own = flights(:two)
          own.update_columns(user_id: user.id, pilot_id: user.id)

          delete api_app_v1_account_path, params: { password: PASSWORD }, headers: bearer(@token), as: :json

          assert_response :no_content
          user.reload
          assert user.disabled?
          assert_equal "deleted-#{user.id}@deleted.invalid", user.email_address
          assert_nil user.first_name
          assert_nil user.password_digest
          assert_not user.active_for_authentication?
          assert_equal user.id, flight.reload.pilot_id
          assert_not Flight.exists?(own.id)
          assert_empty user.app_tokens
        end

        private

        def sign_up
          post api_app_v1_registration_path, params: {
            email: "pilot@example.com", first_name: "Ada", last_name: "Lindqvist", password: PASSWORD
          }, as: :json
          assert_response :created
          @token = response.parsed_body.fetch("token")
          User.find_by!(email_address: "pilot@example.com")
        end

        def bearer(token)
          { "Authorization" => "Bearer #{token}" }
        end
      end
    end
  end
end
