require "test_helper"

class Flights::TrackQualityTest < ActiveSupport::TestCase
  test "excludes no fix, invalid 3D flags and poor accuracy without changing input" do
    points = [ point(0, 10_200).merge(lat: 0, lon: 0, gps_fix: 0),
      point(1, 1_200).merge(gps_flags: 0), point(2, 1_180).merge(horizontal_accuracy_m: 100),
      point(3, 1_160), point(4, 1_140) ]
    original = Marshal.dump(points)
    result = Flights::TrackProcessing.new(track_points: points, sensor_samples: []).call

    assert_equal original, Marshal.dump(points)
    assert_equal 3, result.quality.rejected_count
    assert_equal [ 3, 4 ], result.points.pluck(:elapsed_seconds)
    assert_equal 1_160, result.summary[:max_altitude_m]
    assert_equal 5, result.summary[:sample_count]
    assert_equal 0, result.analysis.timeline_start
  end

  test "keeps a persistent altitude recalibration separated after precision recovers" do
    # Flight 40's measured opening discontinuity, with location anonymized.
    points = [ point(1_610.473096, 1_147.917),
      point(1_610.517558, 1_454.168).merge(vertical_accuracy_m: 91.241),
      point(1_611.113992, 1_465.839), point(1_612.018, 1_461.659) ]
    result = Flights::TrackProcessing.new(track_points: points, sensor_samples: []).call
    assert_equal [ 1_147.917, 1_465.839, 1_461.659 ], result.points.pluck(:altitude_m)
    assert_equal [ 0, 1, 1 ], result.points.pluck(:segment)
    assert_includes result.quality.gaps.sole[:reasons], "altitude_discontinuity"
    assert_equal 1, result.quality.rejected_count
  end

  test "position jumps and outages do not contribute distance or bridge the route" do
    points = [ point(0, 1_000), point(1, 980), point(2, 960).merge(lon: 3),
      point(3, 940).merge(lon: 3), point(20, 600).merge(lon: 3) ]
    result = Flights::TrackProcessing.new(track_points: points, sensor_samples: []).call
    assert_equal [ 0, 0, 1, 1, 2 ], result.points.pluck(:segment)
    assert_includes result.quality.gaps.first[:reasons], "position_discontinuity"
    assert_includes result.quality.gaps.last[:reasons], "gps_gap"
    assert_in_delta 0, result.summary[:distance_m]
  end

  test "ordinary climbs, fast descents and legacy files without quality fields remain usable" do
    points = (0..20).map { |time| point(time, 1_000 + time * 30).merge(vertical_speed_mps: -30) }
    result = Flights::TrackQuality.new(points).call
    assert_empty result.gaps
    assert_equal 21, result.points.size
    legacy = points.map { |row| row.except(:gps_fix, :gps_flags, :horizontal_accuracy_m, :vertical_accuracy_m, :speed_accuracy_mps) }
    assert_equal 21, Flights::TrackQuality.new(legacy).call.points.size
  end

  test "an isolated impossible excursion with nominal GPS quality cannot frame the whole globe" do
    points = [ point(0, 1_000), point(1, 980).merge(lon: -62), point(2, 960), point(3, 940) ]
    result = Flights::TrackQuality.new(points).call
    assert_equal 1, result.rejected_count
    assert_equal [ 2.0 ], result.points.pluck(:lon).uniq
    assert_equal [ 0, 1, 1 ], result.points.pluck(:segment)
  end

  test "missing altitude inside a recorded profile creates a gap" do
    result = Flights::TrackQuality.new([ point(0, 1_000), point(1, nil), point(2, 960) ]).call
    assert_equal [ 0, 1 ], result.points.pluck(:segment)
    assert_equal 1, result.rejected_count
  end

  test "extreme fragmentation stays within the payload budget without connecting segments" do
    points = (0...5_000).map { |time| point(time, 1_000).merge(segment: time) }
    sampled = Flights::SampleTrack.call(points, limit: 400)
    assert_equal 400, sampled.size
    assert_equal 0, sampled.first[:elapsed_seconds]
    assert_equal 4_999, sampled.last[:elapsed_seconds]
    assert_equal 400, sampled.pluck(:segment).uniq.size
  end

  test "decimation retains both sides of every break and phase boundary" do
    points = (0..5_000).map { |time| point(time, 1_000).merge(segment: time < 2_345 ? 0 : 1) }
    sampled = Flights::SampleTrack.call(points, limit: 400, boundaries: [ 1_234.5 ])
    assert_operator sampled.size, :<=, 400
    [ 0, 1_234, 1_235, 2_344, 2_345, 5_000 ].each { |time| assert_includes sampled.pluck(:elapsed_seconds), time }
  end

  test "a discontinuity cannot manufacture a freefall confirmation" do
    origin = Time.utc(2026, 10, 16)
    points = (0..20).map do |time|
      point(time, time < 10 ? 1_000 : 600).merge(recorded_at: origin + time,
        vertical_speed_mps: nil, segment: time < 10 ? 0 : 1)
    end
    analysis = Flights::FlightAnalysis.new(track_points: points, sensor_samples: [], origin_time: origin).call
    assert_equal origin, analysis.bounds[:exit_at], "no observed descent: use the existing fallback, not the altitude step"
  end

  private

  def point(time, altitude)
    { elapsed_seconds: time, lat: 45.0, lon: 2.0, altitude_m: altitude, gps_fix: 3, gps_flags: 1,
      horizontal_accuracy_m: 1.5, vertical_accuracy_m: 2.7, speed_accuracy_mps: 0.1,
      horizontal_speed_mps: 5.0, vertical_speed_mps: 20.0 }
  end
end
