require "test_helper"

class FlightClub::OnboardingTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  test "an existing administrator receives the complete Core Team onboarding" do
    member = users(:julien)
    member.update!(first_name: "Julien", last_name: "Blancher", membership_tier: "core_team", member_number: 2, membership_welcomed_at: nil)
    original_digest = member.password_digest
    member.send_invitation!
    assert_equal original_digest, member.reload.password_digest
    assert member.active_for_authentication?

    get edit_invitation_path(member.invitation_token)
    assert_redirected_to new_session_path
    post session_path, params: { email_address: member.email_address, password: "password123456" }
    assert_redirected_to new_two_factor_setup_path
    assert_equal original_digest, member.reload.password_digest

    sign_in_as member
    get root_path
    assert_redirected_to flight_club_welcome_path
    get flight_club_welcome_path
    assert_response :success
    assert_select "[data-membership-card-number-value='2'][data-membership-card-tier-value='core_team']"
    assert_enqueued_emails 1 do
      patch flight_club_welcome_path
    end
    assert member.reload.membership_welcomed_at
  end

  test "a member accepts the invitation, meets the card once, then enters Sillage" do
    member = users(:invited_member)
    token = member.invitation_token

    get edit_invitation_path(token)
    assert_response :success
    assert_select "h1", "Ada, your place is ready."
    assert_select ".flight-club-micro", text: /Member 0007/

    patch invitation_path(token), params: { password: "password123456", password_confirmation: "password123456" }
    assert_redirected_to flight_club_welcome_path
    assert member.reload.membership_started_at

    get root_path
    assert_redirected_to flight_club_welcome_path

    get flight_club_welcome_path
    assert_response :success
    assert_select "[data-controller='membership-card'][data-stage='invitation'][data-membership-card-number-value='7'][data-membership-card-tier-value='pioneer']"
    assert_select "h1", "Welcome to the first chapter."

    assert_enqueued_emails 1 do
      patch flight_club_welcome_path
    end
    assert_redirected_to root_path
    assert member.reload.membership_welcomed_at

    get root_path
    assert_response :success
    assert_select ".sillage-account-action[href='#{flight_club_path}']", text: "Flight Club"
    assert_select ".sillage-account-action[href='#{profile_path}']", text: "My profile"

    get profile_path
    assert_response :success
    assert_select "#membership [data-membership-card-tier-value='pioneer']"
    assert_select ".sillage-avatar-insignia[src*='insignia-pioneer']", count: 3

    assert_no_enqueued_emails do
      patch flight_club_welcome_path
    end
  end

  test "a member who left before the reveal is welcomed at the next sign-in" do
    sign_in_as users(:member)

    get root_path
    assert_redirected_to flight_club_welcome_path

    get flight_club_path
    assert_redirected_to flight_club_welcome_path
  end

  test "the membership page presents the card of a welcomed member" do
    member = users(:member)
    member.complete_membership_welcome!
    sign_in_as member

    get flight_club_path
    assert_response :success
    assert_select "[data-stage='presented'][data-membership-card-name-value='Elias Okafor']"
    assert_select ".flight-club-rank", "Explorer"
  end

  test "accounts without a membership never see Flight Club" do
    sign_in_as users(:operator)

    get flight_club_welcome_path
    assert_redirected_to root_path
    get root_path
    assert_response :success
    assert_select ".sillage-account-action[href='#{flight_club_path}']", count: 0
  end

  test "non-member invitations keep the standard flow" do
    get edit_invitation_path(users(:invited).invitation_token)

    assert_response :success
    assert_select "h1", "Accept invitation"
  end
end
