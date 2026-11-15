require "test_helper"

class UserMembershipTest < ActiveSupport::TestCase
  test "Core Team can share zero while positive member numbers remain unique" do
    first = User.create!(email_address: "zero-one@example.com", role: "user", first_name: "First", last_name: "Member", membership_tier: "core_team", member_number: 0)
    second = User.create!(email_address: "zero-two@example.com", role: "user", first_name: "Second", last_name: "Member", membership_tier: "core_team", member_number: 0)
    assert_equal "FC 0000", first.member_code
    assert_equal first.member_number, second.member_number
    second.membership_tier = "pioneer"
    assert_not second.valid?
    assert_includes second.errors[:member_number], "is reserved for Core Team"
    first.update!(member_number: 1)
    second.assign_attributes(membership_tier: "core_team", member_number: 1)
    assert_not second.valid?
    assert second.errors.of_kind?(:member_number, :taken)
  end

  test "database rejects zero for other tiers and duplicate positive numbers" do
    member = User.create!(email_address: "database-zero@example.com", role: "user", first_name: "Data", last_name: "Member", membership_tier: "core_team", member_number: 0)
    assert_raises(ActiveRecord::StatementInvalid) do
      User.transaction(requires_new: true) { member.update_columns(membership_tier: nil) }
    end
    member.reload.update!(member_number: 1)
    other = User.create!(email_address: "database-positive@example.com", role: "user", first_name: "Other", last_name: "Member", membership_tier: "core_team", member_number: 2)
    assert_raises(ActiveRecord::RecordNotUnique) do
      User.transaction(requires_new: true) { other.update_columns(member_number: 1) }
    end
  end

  test "members receive permanent sequential numbers" do
    IdentifierSequence.reserve_through!(User::MEMBER_NUMBER_SEQUENCE, 8)
    first = User.invite!(email_address: "one@example.com", role: "user", first_name: "Una", last_name: "Member", membership_tier: "pathfinder")
    second = User.invite!(email_address: "two@example.com", role: "user", first_name: "Dos", last_name: "Member", membership_tier: "trailblazer")

    assert_equal [ 9, 10 ], [ first.member_number, second.member_number ]
    assert_equal "FC 0009", first.member_code
    first.update!(membership_tier: "trailblazer")
    assert_equal 9, first.reload.member_number
  end

  test "a membership requires a name and a known tier" do
    user = User.new(email_address: "nameless@example.com", role: "user", membership_tier: "pioneer")

    assert_not user.valid?
    assert user.errors.of_kind?(:first_name, :blank)
    user.assign_attributes(first_name: "Nia", last_name: "Member", membership_tier: "platinum")
    assert_not user.valid?
    assert user.errors.of_kind?(:membership_tier, :inclusion)
  end

  test "the Core Team edition reads as a team membership" do
    member = User.invite!(email_address: "team@example.com", role: "admin", first_name: "Tea", last_name: "Member", membership_tier: "core_team")

    assert_equal [ "Core Team", "part of the Core Team", "Team member" ], [ member.membership_rank, member.membership_rank_phrase, member.membership_status ]
    assert_includes UserMailer.invitation(member).html_part.body.decoded, "flight_club/card-core_team-"
  end

  test "accounts without a membership take no member number" do
    user = User.invite!(email_address: "staff@example.com", role: "user", membership_tier: "")

    assert_nil user.member_number
    assert_not user.member?
  end
end
