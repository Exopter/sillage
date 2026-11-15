require "test_helper"

class UserMembershipTest < ActiveSupport::TestCase
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

  test "accounts without a membership take no member number" do
    user = User.invite!(email_address: "staff@example.com", role: "user", membership_tier: "")

    assert_nil user.member_number
    assert_not user.member?
  end
end
