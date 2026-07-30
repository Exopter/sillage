require "test_helper"

class Core::UsersControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  test "requires admin access" do
    sign_in_as users(:operator)

    get core_users_path

    assert_redirected_to root_path
    assert_equal "Admin access is required.", flash[:alert]
  end

  test "lists users for admins" do
    sign_in_as users(:julien)

    get core_users_path

    assert_response :success
    assert_select "h1", "Users"
    assert_select ".core-user-row", minimum: 3
  end

  test "invites users from Core" do
    sign_in_as users(:julien)

    assert_enqueued_emails 1 do
      post core_users_path, params: {
        user: {
          email_address: "new.operator@exopter.com",
          role: "user"
        }
      }
    end

    assert_redirected_to core_users_path
    assert_equal "user", User.find_by!(email_address: "new.operator@exopter.com").role
  end

  test "updates roles and resets two-factor authentication" do
    admin = users(:julien)
    user = users(:operator)
    sign_in_as admin
    user.enable_totp!(ROTP::Base32.random_base32)

    patch core_user_path(user), params: { user: { role: "admin" } }

    assert_redirected_to core_users_path
    assert user.reload.admin?

    patch reset_two_factor_core_user_path(user)

    assert_redirected_to core_users_path
    assert_not user.reload.totp_configured?
  end

  test "rejects an unsupported role" do
    sign_in_as users(:julien)

    patch core_user_path(users(:operator)), params: { user: { role: "owner" } }

    assert_response :unprocessable_entity
    assert_equal "user", users(:operator).reload.role
  end

  test "does not disable the current user" do
    admin = users(:julien)
    sign_in_as admin

    patch disable_core_user_path(admin)

    assert_redirected_to core_users_path
    assert_equal "You cannot disable your own account.", flash[:alert]
  end
end
