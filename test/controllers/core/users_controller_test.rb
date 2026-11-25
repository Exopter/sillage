require "test_helper"

class Core::UsersControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  test "requires admin access" do
    sign_in_as users(:operator)

    get core_users_path

    assert_response :forbidden
    get root_path
    assert_select ".sillage-core-link", count: 0
  end

  test "lists users for admins" do
    sign_in_as users(:julien)

    get core_users_path

    assert_response :success
    assert_select "h1", "Users"
    assert_select ".core-user-row", minimum: 3
    assert_select ".sillage-core-link[href='#{core_path}']", text: "Core", count: 1
    assert_select ".exds-page-header a[href='#{new_core_user_path}']", text: "Invite user"
    assert_select "form[action='#{core_users_path}'] input[name='user[email_address]']", count: 0
  end

  test "shows the invitation form on its own page" do
    sign_in_as users(:julien)

    get new_core_user_path

    assert_response :success
    assert_select "h1", "Invite user"
    assert_select "form[action='#{core_users_path}'] input[name='user[email_address]']"
    assert_select "select[name='user[role]'] option[value='operator']", text: "Operator"
    assert_select ".exds-form-actions a[href='#{core_users_path}']", text: "Cancel"
  end

  test "invites operators from Core" do
    sign_in_as users(:julien)

    assert_enqueued_emails 1 do
      post core_users_path, params: {
        user: {
          email_address: "new.operator@exopter.com",
          role: "operator"
        }
      }
    end

    assert_redirected_to core_users_path
    assert_equal "operator", User.find_by!(email_address: "new.operator@exopter.com").role
  end

  test "assigns the Operator role to an existing user" do
    sign_in_as users(:julien)
    user = users(:operator)

    get edit_core_user_path(user)
    assert_select "select[name='user[role]'] option[value='operator']", text: "Operator"
    patch core_user_path(user), params: { user: { role: "operator" } }

    assert_redirected_to core_users_path
    assert_equal "operator", user.reload.role
  end

  test "invites Flight Club members with a name, a rank and a member number" do
    sign_in_as users(:julien)

    assert_enqueued_emails 1 do
      post core_users_path, params: {
        user: { email_address: "new.member@example.com", role: "user", first_name: "Noor", last_name: "Vance", membership_tier: "trailblazer" }
      }
    end

    member = User.find_by!(email_address: "new.member@example.com")
    assert_equal [ "Noor Vance", "trailblazer" ], [ member.full_name, member.membership_tier ]
    assert member.member_number
    get core_users_path
    assert_select ".status-pill", text: "Trailblazer"
  end

  test "a membership without a name is refused" do
    sign_in_as users(:julien)

    assert_no_enqueued_emails do
      post core_users_path, params: { user: { email_address: "nameless@example.com", role: "user", membership_tier: "pioneer" } }
    end

    assert_response :unprocessable_entity
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

  test "an admin edits a pilot's wing settings" do
    pilot = users(:member)
    sign_in_as users(:julien)

    get edit_core_user_path(pilot)
    assert_response :success
    assert_select "form[action='#{core_user_path(pilot)}'] .core-panel", count: 2
    assert_select "input[name='user[weight_kg]']"
    assert_select "input[name='user[tunnel_speed_kmh]']"

    patch core_user_path(pilot), params: { user: { role: "user", first_name: "Elias", last_name: "Okafor", membership_tier: "explorer",
      weight_kg: "72.5", height_cm: "180", cg_setting: "3.5", tunnel_glide_ratio: "3.1", tunnel_speed_kmh: "170" } }
    assert_redirected_to core_users_path
    pilot.reload
    assert_equal [ BigDecimal("72.5"), 180, BigDecimal("3.5"), BigDecimal("3.1"), 170 ], User::WING_SETTINGS.map { |setting| pilot[setting] }
    stamped = pilot.wing_settings_updated_at
    assert stamped

    patch core_user_path(pilot), params: { user: { role: "user", tunnel_speed_kmh: "900" } }
    assert_response :unprocessable_entity
    assert_equal 170, pilot.reload.tunnel_speed_kmh

    patch core_user_path(pilot), params: { user: { role: "user", first_name: "Eli" } }
    assert_equal stamped, pilot.reload.wing_settings_updated_at
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
