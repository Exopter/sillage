require "test_helper"

class AnalysisStoreTest < ActiveSupport::TestCase
  test "external sorting is stable across runs and random access preserves timestamps" do
    points = 3_011.times.map { |index| { elapsed_seconds: index % 7, recorded_at: Time.at(index, 123456789, :nanosecond), altitude_m: index.to_f } }
    FlightImports::AnalysisStore.open do |store|
      sorted = store.sequence(points).sort_by { |point| point[:elapsed_seconds] }
      assert_equal points.sort_by.with_index { |point, index| [ point[:elapsed_seconds], index ] }, sorted.to_a
      assert_equal sorted.to_a.last, sorted[-1]
      assert_nil sorted[sorted.size]
      assert_equal sorted.to_a[1000, 4], sorted[1000, 4]
    end
  end

  test "disk-backed metrics and phase analysis match in-memory inputs in both altitude modes" do
    started = Time.utc(2026, 9, 1)
    points = 2_101.times.map do |index|
      t = index * 0.2
      altitude = 4200 - [ t * 25, 4000 ].min
      { recorded_at: started + t, elapsed_seconds: t, lat: 44.0 + t / 100_000, lon: 1.0,
        altitude_m: altitude, vel_n_mps: 30.0, vel_e_mps: 10.0, vel_d_mps: t < 160 ? 25.0 : 0.0 }
    end.reverse
    [ 0.0, 1000.0 ].each do |offset|
      sensors = points.map { |point| point.slice(:recorded_at, :elapsed_seconds).merge(sensor_type: "BARO", readings: { "pressure_altitude_m" => point[:altitude_m] + offset }) }
      memory_metrics = Flights::TrackMetrics.new(points)
      prepared = memory_metrics.prepared_points
      expected = Flights::FlightAnalysis.new(track_points: prepared, sensor_samples: sensors).call
      FlightImports::AnalysisStore.open do |store|
        metrics = Flights::TrackMetrics.new(store.sequence(points))
        actual_points = metrics.prepared_points
        assert_instance_of FlightImports::AnalysisStore::Sequence, actual_points
        actual = Flights::FlightAnalysis.new(track_points: actual_points, sensor_samples: store.sequence(sensors)).call
        assert_equal expected.as_json, actual.as_json
        assert_equal memory_metrics.summary(prepared, bounds: expected.bounds), metrics.summary(actual_points, bounds: actual.bounds)
      end
    end
  end
  test "closes all temporary sequences after an interrupted analysis" do
    sequence = nil
    assert_raises(IOError) do
      FlightImports::AnalysisStore.open do |store|
        sequence = store.sequence([ { elapsed_seconds: 1.0 } ])
        sequence.map { |sample| sample }
        raise IOError, "insertion failed"
      end
    end
    assert_raises(IOError) { sequence.each.to_a }
  end
end
