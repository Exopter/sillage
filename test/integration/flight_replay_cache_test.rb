require "test_helper"
require_relative "../support/method_replacement"

class FlightReplayCacheTest < ActionDispatch::IntegrationTest
  include MethodReplacement
  test "derived telemetry is reused and invalidated by sample or flight updates" do
    flight = flights(:one)
    point = flight.track_points.first!
    timestamp = Time.current.change(usec: 100_000)
    point.update_columns(updated_at: timestamp)
    sign_in_as users(:julien)
    original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    calls = 0
    original = Flights::FlightAnalysis.method(:new)
    factory = ->(**arguments) { calls += 1; original.call(**arguments) }
    replace_method(Flights::FlightAnalysis, :new, factory) do
      2.times { get flight_path(flight); assert_response :success }
      assert_equal 1, calls
      point.update!(altitude_m: point.altitude_m.to_f + 1, updated_at: timestamp + 0.001)
      get flight_path(flight)
      assert_response :success
      assert_equal 2, calls
      flight.touch
      get flight_path(flight)
      assert_response :success
      assert_equal 3, calls
    end
  ensure
    Rails.cache = original_cache if original_cache
  end
end
