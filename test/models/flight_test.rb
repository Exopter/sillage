require "test_helper"

class FlightTest < ActiveSupport::TestCase
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
    assert flight.visible_to?(users(:operator))
    assert_not flight.visible_to?(nil)
    assert_empty Flight.visible_to(nil)
    flight.update!(user: users(:operator), visibility: "private")
    assert_not flight.visible_to?(users(:julien))
    assert_not_includes Flight.visible_to(users(:julien)), flight
  end

  test "height uses the lowest altitude as ground reference" do
    flight = flights(:one)
    flight.min_altitude_m = 3_298.0
    flight.max_altitude_m = 4_100.0

    assert_equal 802.0, flight.height_m
  end
end
