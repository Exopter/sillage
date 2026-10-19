require "test_helper"
require_relative "../../support/method_replacement"

class Flights::RoutePreviewTest < ActiveSupport::TestCase
  include MethodReplacement

  test "preview never reads sensors or runs phase analysis and caches only the bounded route" do
    flight = flights(:one)
    flight.track_points.delete_all
    flight.track_points.create!(lat: 48.0, lon: 2.0, elapsed_seconds: 0)
    flight.track_points.create!(lat: 48.00001, lon: 2.0, elapsed_seconds: 1)
    original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    queries = []
    subscription = ActiveSupport::Notifications.subscribe("sql.active_record") { |*args| queries << args.last[:sql] }
    replace_method(Flights::FlightAnalysis, :new, ->(**) { flunk "A map must not run phase analysis" }) do
      first = Flights::RoutePreview.call(flight)
      assert_not_empty first
      assert_equal first, Flights::RoutePreview.call(flight)
      assert_equal 1, queries.count { |sql| sql.include?('"track_points"."lat"') }
      assert queries.none? { |sql| sql.include?('"sensor_samples"') }

      point = flight.track_points.ordered.first!
      point.update!(lat: point.lat + 0.000001, updated_at: Time.current + 1.second)
      assert_not_equal first, Flights::RoutePreview.call(flight)
    end
  ensure
    ActiveSupport::Notifications.unsubscribe(subscription) if subscription
    Rails.cache = original_cache if original_cache
  end

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
