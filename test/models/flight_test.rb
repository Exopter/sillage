require "test_helper"

class FlightTest < ActiveSupport::TestCase
  test "a flight defaults its pilot to its creator and retains a different selected pilot" do
    creator = users(:julien)
    flight = creator.flights.create!(name: "Default pilot")
    assert_equal creator, flight.pilot

    flight.update!(pilot: users(:operator))
    assert_equal users(:operator), flight.reload.pilot
    assert_equal creator, flight.user
    flight.update!(user: users(:member))
    assert_equal users(:operator), flight.reload.pilot
  end

  test "queued recording creation preserves its creator after account deactivation" do
    creator = users(:operator)
    creator.update!(disabled_at: Time.current)
    flight = creator.flights.create!(status: "processing")
    assert_equal creator, flight.reload.pilot
  end

  test "a persisted flight cannot lose its pilot or reference an unknown user" do
    flight = flights(:one)
    assert_not flight.update(pilot: nil)
    assert flight.errors.added?(:pilot, :blank)
    assert_not flight.reload.update(pilot_id: User.maximum(:id) + 1)
    assert flight.errors.added?(:pilot, :blank)

    assert_raises(ActiveRecord::NotNullViolation) do
      Flight.transaction(requires_new: true) { flight.reload.update_column(:pilot_id, nil) }
    end
    assert_raises(ActiveRecord::InvalidForeignKey) do
      Flight.transaction(requires_new: true) { flight.reload.update_column(:pilot_id, User.maximum(:id) + 1) }
    end
  end

  test "invited users can be assigned, inactive users cannot, and historical pilots are preserved" do
    flight = flights(:one)
    assert_includes User.available_as_pilot, users(:invited)
    flight.update!(pilot: users(:invited))
    pilot = users(:operator)
    flight.reload.update!(pilot:)
    pilot.update!(disabled_at: Time.current)
    flight.update!(description: "Historical pilot retained")
    assert_equal pilot, flight.reload.pilot
    assert_not users(:julien).flights.new(pilot:).valid?
  end

  test "assigning a pilot does not grant access and prevents deleting their account" do
    pilot = users(:member)
    flight = flights(:one)
    flight.update!(pilot:)
    assert_not flight.visible_to?(pilot)
    assert_not_includes Flight.visible_to(pilot), flight
    assert_not pilot.destroy
    assert_includes pilot.errors.full_messages.to_sentence, "piloted flights exist"
    assert_equal flight, pilot.piloted_flights.sole
  end

  test "pilot display uses the full name with an email fallback" do
    flight = flights(:one)
    assert_equal users(:julien).email_address, flight.display_pilot
    flight.pilot = users(:member)
    assert_equal "Elias Okafor", flight.display_pilot
  end

  test "new flights are private and unsupported visibility is rejected" do
    flight = users(:julien).flights.new(name: "Private flight")
    assert_equal "private", flight.visibility
    flight.visibility = "public"
    assert_not flight.valid?
    assert flight.errors.added?(:visibility, :inclusion, value: "public")
  end

  test "visibility has no anonymous access or administrator bypass" do
    flight = flights(:one)
    assert flight.visible_to?(users(:julien))
    assert_not flight.visible_to?(users(:operator))
    assert_not flight.visible_to?(nil)
    flight.update!(visibility: "team")
    assert_not flight.visible_to?(users(:operator)), "public flights are hidden from the user role"
    users(:operator).update!(role: "operator")
    assert flight.visible_to?(users(:operator).reload)
    assert_not flight.visible_to?(nil)
    assert_empty Flight.visible_to(nil)
    flight.update!(user: users(:operator), visibility: "private")
    assert_not flight.visible_to?(users(:julien))
    assert_not_includes Flight.visible_to(users(:julien)), flight
  end

  test "the user role sees its own flights and what is shared with it, never public ones" do
    member = users(:member)
    team_flight = flights(:one)
    team_flight.update!(visibility: "team")
    open_folder = FlightFolder.create!(user: users(:julien), name: "Open folder", visibility: "public")
    shared = FlightFolder.create!(user: users(:julien), name: "Shared", visibility: "shared")
    FlightFolderMembership.create!(flight_folder: shared, user: member)
    own = member.flights.create!(name: "Mine")

    assert_not team_flight.visible_to?(member)
    assert_not open_folder.visible_to?(member)
    assert shared.visible_to?(member)
    assert_includes Flight.visible_to(member), own
    assert_not_includes Flight.visible_to(member), team_flight
    assert_not_includes FlightFolder.visible_to(member), open_folder
    users(:operator).update!(role: "operator")
    assert team_flight.visible_to?(users(:operator).reload)
  end

  test "height uses the lowest altitude as ground reference" do
    flight = flights(:one)
    flight.min_altitude_m = 3_298.0
    flight.max_altitude_m = 4_100.0

    assert_equal 802.0, flight.height_m
  end
end
