require "test_helper"

class FlightTest < ActiveSupport::TestCase
  test "height uses the lowest altitude as ground reference" do
    flight = flights(:one)
    flight.min_altitude_m = 3_298.0
    flight.max_altitude_m = 4_100.0

    assert_equal 802.0, flight.height_m
  end
end
