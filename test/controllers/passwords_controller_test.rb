require "test_helper"

class PasswordsControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  test "sends password reset instructions for an active account" do
    assert_enqueued_email_with PasswordsMailer, :reset, args: [ users(:operator) ] do
      post passwords_path, params: { email_address: users(:operator).email_address }
    end

    assert_redirected_to new_session_path
  end

  test "updates password with a valid token and clears sessions" do
    user = users(:operator)
    user.sessions.create!(user_agent: "test", ip_address: "127.0.0.1")
    token = user.password_reset_token

    patch password_path(token), params: {
      password: "new-password-123456",
      password_confirmation: "new-password-123456"
    }

    assert_redirected_to new_session_path
    assert user.reload.authenticate("new-password-123456")
    assert_empty user.sessions
  end
end
