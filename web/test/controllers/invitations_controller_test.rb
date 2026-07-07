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
end
