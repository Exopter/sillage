require "test_helper"

class Flights::ProcessedTrackTest < ActiveSupport::TestCase
  test "full resolution pressure analysis projects readings without allocating telemetry models" do
    flight = flights(:one)
    flight.track_points.delete_all
    flight.sensor_samples.delete_all
    origin = Time.utc(2026, 10, 19)
    flight.update!(started_at: origin)
    flight.track_points.create!(lat: 48, lon: 2, altitude_m: 100, recorded_at: origin, elapsed_seconds: 0)
    sensors = 200.times.map do |index|
      { flight_id: flight.id, sensor_type: "BARO", recorded_at: origin + index * 0.05, elapsed_seconds: index * 0.05,
        readings: { "pressure_altitude_m" => (2000 - index).to_s, "unused" => [ 1, 2, 3 ] },
        created_at: origin, updated_at: origin }
    end
    SensorSample.insert_all!(sensors)
    flight.sensor_samples.create!(sensor_type: "IMU", recorded_at: origin - 1, elapsed_seconds: -1)
    flight.sensor_samples.create!(sensor_type: "IMU", recorded_at: origin + 20, elapsed_seconds: 20)
    expected = Flights::TrackProcessing.new(
      track_points: flight.track_points.map { |point| point.attributes.symbolize_keys },
      sensor_samples: flight.sensor_samples.ordered.to_a, origin_time: origin, sensor_count: 202).call
    instantiated = []
    subscription = ActiveSupport::Notifications.subscribe("instantiation.active_record") { |*args| instantiated << args.last[:class_name] }
    actual = Flights::ProcessedTrack.new(flight).call
    assert_equal expected.analysis, actual[:analysis]
    assert_equal expected.summary, actual[:summary]
    assert_equal "degraded", actual[:analysis].mode
    assert_equal(-1, actual[:analysis].timeline_start)
    assert_equal 20, actual[:analysis].timeline_end
    assert instantiated.none? { |name| %w[TrackPoint SensorSample].include?(name) }
    assert_equal 202, flight.sensor_samples.count
  ensure
    ActiveSupport::Notifications.unsubscribe(subscription) if subscription
  end
end
