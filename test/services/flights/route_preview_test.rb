require "test_helper"

class Flights::RoutePreviewTest < ActiveSupport::TestCase
  test "preview is bounded chronological and retains endpoints without invalid coordinates" do
    flight = flights(:one)
    flight.track_points.delete_all
    now = Time.current
    points = 1200.times.map do |index|
      { flight_id: flight.id, lat: 48.0 + index * 0.00001, lon: 2.0, elapsed_seconds: index,
        created_at: now, updated_at: now }
    end
    TrackPoint.insert_all!(points)
    flight.track_points.create!(lat: 999, lon: 2, elapsed_seconds: 1201)
    route = Flights::RoutePreview.call(flight)
    assert_operator route.length, :<=, 400
    assert_equal [ 48.0, 2.0 ], route.first
    assert_equal [ 48.01199, 2.0 ], route.last
    assert_equal route.sort_by(&:first), route
    assert_equal [], Flights::RoutePreview.call(nil)
    assert_equal [], Flights::RoutePreview.call(flight_imports(:one))
  end
end
