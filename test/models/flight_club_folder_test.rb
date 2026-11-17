require "test_helper"

class FlightClubFolderTest < ActiveSupport::TestCase
  setup do
    @owner = users(:julien)
    @folder = FlightFolder.create!(user: @owner, name: "FlightClub", visibility: "club")
    @flight = @owner.flights.create!(status: "review", started_at: Time.utc(2026, 11, 16, 9), folder: @folder)
  end

  test "every Flight Club member sees the folder and its flights without being added" do
    member = users(:member)
    assert member.member?
    assert @folder.visible_to?(member)
    assert_includes FlightFolder.visible_to(member), @folder
    assert_includes Flight.visible_to(member), @flight
    assert_not @folder.contributable_by?(member), "viewing does not let a member file flights"
    assert_equal "club", @flight.effective_visibility
    assert_includes Flight.with_effective_visibility("shared"), @flight
  end

  test "a user outside the Flight Club does not see it unless added to the folder" do
    outsider = users(:operator)
    assert_not outsider.member?
    assert_not @folder.visible_to?(outsider)
    assert_not_includes FlightFolder.visible_to(outsider), @folder
    assert_not_includes Flight.visible_to(outsider), @flight
    @folder.memberships.create!(user: outsider)
    assert @folder.reload.visible_to?(outsider)
    assert @folder.contributable_by?(outsider)
    assert_includes FlightFolder.contributable_to(outsider), @folder
  end

  test "a member who joins later gains access and one who leaves loses it" do
    user = users(:operator)
    user.update!(first_name: "New", last_name: "Member", membership_tier: users(:member).membership_tier)
    assert_includes FlightFolder.visible_to(user), @folder
    user.update!(membership_tier: nil)
    assert_not_includes FlightFolder.visible_to(user), @folder
  end
end
