require "test_helper"

class Flights::AnalysisSensorsTest < ActiveSupport::TestCase
  setup do
    @flight = flights(:one)
    @flight.track_points.delete_all
    @flight.sensor_samples.delete_all
    @origin = Time.utc(2026, 10, 19)
    @flight.update!(started_at: @origin)
    3.times do |i|
      @flight.track_points.create!(lat: 48 + i * 0.0001, lon: 2, altitude_m: 1200 - i,
        recorded_at: @origin + i, elapsed_seconds: i)
    end
  end

  test "GPS replay skips pressure rows and preserves all timeline extremes" do
    100.times { |i| sensor(altitude: 1000 - i, elapsed: i * 0.1) }
    @flight.sensor_samples.create!(sensor_type: "IMU", recorded_at: @origin + 40, elapsed_seconds: 2)
    @flight.sensor_samples.create!(sensor_type: "IMU", elapsed_seconds: -10)
    actual = assert_equivalent
    assert_equal "gps", actual[:analysis].mode
    assert_equal(-10, actual[:analysis].timeline_start)
    assert_equal 40, actual[:analysis].timeline_end
    selected = Flights::AnalysisSensors.new(@flight).for_track(points, origin_time: @origin)
    assert selected.all? { |sample| sample[:sensor_type] == "TIMELINE" }
    assert_operator selected.size, :<=, 4
  end

  test "pressure dominates with GPS present and preserves full resolution analysis" do
    300.times { |i| sensor(altitude: 2500 - i * 4, elapsed: i * 0.1) }
    actual = assert_equivalent
    assert_equal "degraded", actual[:analysis].mode
    assert_kind_of Flights::AnalysisSensors, Flights::AnalysisSensors.new(@flight).for_track(points, origin_time: @origin)
  end

  test "pressure conversion can require degraded analysis without an altitude reading" do
    @flight.sensor_samples.create!(sensor_type: "BARO", recorded_at: @origin, readings: { pressure: 60000 })
    assert_equal "degraded", assert_equivalent[:analysis].mode
  end

  test "string values and malformed optional pressure values use the exact fallback" do
    [ { pressure_altitude_m: "1900" }, { pressure: "60000" }, { pressure: "invalid" },
      { pressure_altitude_m: [ 1 ], pressure: false }, { pressure_altitude_m: nil, pressure: nil } ].each do |readings|
      @flight.sensor_samples.delete_all
      @flight.sensor_samples.create!(sensor_type: "BARO", recorded_at: @origin, readings:)
      assert_equivalent
    end
  end

  test "extreme duplicate timestamps cannot change the selected analysis mode" do
    sensor(altitude: 1000, elapsed: 0)
    sensor(altitude: 8000, elapsed: 0.0001)
    assert_equal "gps", assert_equivalent[:analysis].mode
  end

  test "no GPS and pressure-only recordings retain degraded mode" do
    @flight.track_points.delete_all
    10.times { |i| sensor(altitude: 2000 - i, elapsed: i) }
    assert_equal "degraded", assert_equivalent[:analysis].mode
  end

  test "missing origin uses the GPS clock and preserves elapsed-only sensor bounds" do
    @flight.update!(started_at: nil)
    sensor(altitude: 1000, elapsed: 10)
    @flight.sensor_samples.create!(sensor_type: "IMU", elapsed_seconds: 30)
    assert_equivalent
  end

  private

  def points
    @flight.track_points.ordered.map { |point| point.attributes.symbolize_keys }
  end

  def sensor(altitude:, elapsed:)
    @flight.sensor_samples.create!(sensor_type: "BARO", recorded_at: @origin + elapsed,
      elapsed_seconds: elapsed, readings: { pressure_altitude_m: altitude })
  end

  def assert_equivalent
    expected = Flights::TrackProcessing.new(track_points: points, sensor_samples: @flight.sensor_samples.ordered.to_a,
      origin_time: @flight.started_at).call
    actual = Flights::ProcessedTrack.new(@flight).call
    assert_equal expected.analysis, actual[:analysis]
    assert_equal expected.summary, actual[:summary]
    actual
  end
end
