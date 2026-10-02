require "test_helper"
require "csv"

module Flights
  class DetectBoundsTest < ActiveSupport::TestCase
    test "dense stationary records do not trigger quadratic window scans" do
      counter = Class.new(DetectBounds) do
        attr_reader :visits

        private

        def numeric(point, key)
          @visits = @visits.to_i + 1
          super
        end
      end
      start = Time.utc(2026, 9, 5)
      points = 10_000.times.map { { recorded_at: start, elapsed_seconds: 0.0, altitude_m: 100.0, horizontal_speed_mps: 0.0, vertical_speed_mps: 0.0 } }
      detector = counter.new(points)
      assert_equal({ exit_at: start, opening_at: start, landing_at: start }, detector.call)
      assert_operator detector.visits, :<, points.size * 80
    end

    test "detects aircraft exit after climb instead of recorder start" do
      started_at = Time.zone.parse("2026-05-20 09:39:03 UTC")
      points = [
        point(started_at, 0.0, 4_718.8, 39.6, -17.9),
        point(started_at, 33.0, 4_903.5, 53.0, -7.1),
        point(started_at, 52.6, 5_038.7, 36.8, -1.8),
        point(started_at, 116.0, 4_891.9, 30.9, -0.1),
        point(started_at, 124.0, 4_886.3, 30.2, 0.0),
        point(started_at, 126.2, 4_884.3, 29.8, 0.8),
        point(started_at, 127.8, 4_882.4, 29.1, 0.7),
        point(started_at, 128.0, 4_881.7, 28.5, 2.9),
        point(started_at, 128.4, 4_879.3, 27.1, 6.7),
        point(started_at, 129.0, 4_873.7, 26.4, 10.9),
        point(started_at, 129.4, 4_869.3, 25.8, 12.4),
        point(started_at, 130.2, 4_859.4, 25.2, 14.2)
      ]

      bounds = DetectBounds.new(points).call

      assert_equal started_at + 128.0, bounds[:exit_at]
    end

    test "rejects GPS recovery spikes before the aircraft climb at full and display sample rates" do
      started_at = Time.utc(2026, 10, 2)
      # Flight 27's GPS briefly reported fast descent below ground during takeoff.
      points = CSV.read(file_fixture("flight_exit_gps_recovery.csv"), headers: true).map do |row|
        point(started_at, *row.fields.map(&:to_f))
      end

      [ 1, 5 ].each do |step|
        bounds = DetectBounds.new(points.each_slice(step).map(&:first)).call

        assert_in_delta 1_204.0, bounds[:exit_at] - started_at, 2.0
      end
    end

    test "does not use an isolated fast descent as the movement fallback during a climb" do
      started_at = Time.utc(2026, 10, 2)
      points = [
        point(started_at, 0.0, 100.0, 0.0, 0.0),
        point(started_at, 10.0, 160.0, 30.0, -6.0),
        point(started_at, 11.0, 161.0, 30.0, 15.0),
        point(started_at, 12.0, 172.0, 30.0, -6.0),
        point(started_at, 13.0, 178.0, 30.0, -6.0)
      ]

      assert_equal started_at, DetectBounds.new(points).call[:exit_at]
    end

    test "does not confirm fast descent across missing telemetry" do
      started_at = Time.utc(2026, 10, 2)
      points = [
        point(started_at, 0.0, 100.0, 0.0, 0.0),
        point(started_at, 10.0, 200.0, 30.0, 15.0),
        point(started_at, 20.0, 100.0, 30.0, 15.0),
        point(started_at, 21.0, 210.0, 30.0, -6.0)
      ]

      assert_equal started_at, DetectBounds.new(points).call[:exit_at]
    end

    test "duplicate fast samples do not count as sustained descent" do
      started_at = Time.utc(2026, 10, 2)
      points = [ point(started_at, 0.0, 100.0, 0.0, 0.0) ] +
        Array.new(20) { point(started_at, 10.0, 200.0, 30.0, 15.0) } +
        [ point(started_at, 11.0, 210.0, 30.0, -6.0) ]

      assert_equal started_at, DetectBounds.new(points).call[:exit_at]
    end

    test "keeps first point when descent starts immediately" do
      started_at = Time.zone.parse("2024-04-20 04:20:00 UTC")
      points = [
        point(started_at, 0.0, 4_100.0, 0.7, 0.0),
        point(started_at, 5.0, 3_980.0, 33.3, 30.0),
        point(started_at, 10.0, 3_820.0, 38.0, 34.0),
        point(started_at, 15.0, 3_630.0, 41.6, 36.0)
      ]

      bounds = DetectBounds.new(points).call

      assert_equal started_at, bounds[:exit_at]
    end

    test "chooses the lowest opening-like slowdown after earlier flares" do
      started_at = Time.zone.parse("2026-07-07 12:00:00 UTC")
      points = [
        point(started_at, 0.0, 3_200.0, 25.0, 0.0),
        point(started_at, 5.0, 3_080.0, 28.0, 26.0),
        point(started_at, 10.0, 2_930.0, 31.0, 31.0),
        point(started_at, 15.0, 2_780.0, 34.0, 30.0),
        point(started_at, 20.0, 2_640.0, 36.0, 28.0),
        point(started_at, 21.0, 2_630.0, 32.0, 8.0),
        point(started_at, 22.0, 2_622.0, 30.0, 7.0),
        point(started_at, 23.0, 2_615.0, 29.0, 6.0),
        point(started_at, 24.0, 2_609.0, 28.0, 6.0),
        point(started_at, 30.0, 2_430.0, 37.0, 31.0),
        point(started_at, 36.0, 2_240.0, 39.0, 32.0),
        point(started_at, 42.0, 2_050.0, 39.0, 31.0),
        point(started_at, 50.0, 1_790.0, 35.0, 29.0),
        point(started_at, 51.0, 1_780.0, 18.0, 8.0),
        point(started_at, 52.0, 1_773.0, 15.0, 6.5),
        point(started_at, 53.0, 1_767.0, 14.0, 5.8),
        point(started_at, 54.0, 1_762.0, 14.0, 5.3),
        point(started_at, 70.0, 1_680.0, 12.0, 5.0),
        point(started_at, 95.0, 1_560.0, 10.0, 4.8),
        point(started_at, 120.0, 900.0, 3.0, 1.0)
      ]

      bounds = DetectBounds.new(points).call

      assert_equal started_at + 51.0, bounds[:opening_at]
    end

    test "detects canopy before later turns despite a GPS altitude outlier at full and display sample rates" do
      started_at = Time.utc(2026, 10, 2)
      # Flight 27 includes the opening, two canopy turns and a false ground floor.
      points = CSV.read(file_fixture("flight_opening_canopy_turns.csv"), headers: true).map do |row|
        point(started_at, *row.fields.map(&:to_f))
      end

      [ 1, 5 ].each do |step|
        bounds = DetectBounds.new(points.each_slice(step).map(&:first)).call

        assert_in_delta 1_272.0, bounds[:opening_at] - started_at, 1.0
        assert_in_delta 1_202.8, bounds[:exit_at] - started_at, 1.0
      end
    end

    test "does not confirm a sustained vertical flare while horizontal flight remains fast" do
      started_at = Time.utc(2026, 10, 2)
      flare = (21..41).map { |elapsed| point(started_at, elapsed, 1_400 - (elapsed - 21) * 5, 35.0, 5.0) }

      bounds = DetectBounds.new(opening_sequence(started_at, flare)).call

      assert_equal started_at + 61, bounds[:opening_at]
    end

    test "requires continuous observed canopy duration rather than sample count" do
      started_at = Time.utc(2026, 10, 2)
      scenarios = {
        short_slowdown: (21..25).to_a,
        missing_telemetry: [ 21, 22, 40, 41 ],
        duplicate_samples: Array.new(100, 21) + [ 22, 23, 24 ]
      }
      scenarios.each do |name, times|
        flare = times.map { |elapsed| point(started_at, elapsed, 1_400 - (elapsed - 21) * 5, 12.0, 5.0) }

        bounds = DetectBounds.new(opening_sequence(started_at, flare)).call

        assert_equal started_at + 61, bounds[:opening_at], name.to_s
      end
    end

    test "missing speed observations do not confirm canopy flight" do
      started_at = Time.utc(2026, 10, 2)
      [ :horizontal_speed_mps, :vertical_speed_mps ].each do |missing|
        flare = (21..41).map do |elapsed|
          point(started_at, elapsed, 1_400 - (elapsed - 21) * 5, 12.0, 5.0).merge(missing => nil)
        end

        bounds = DetectBounds.new(opening_sequence(started_at, flare)).call

        assert_equal started_at + 61, bounds[:opening_at], missing.to_s
      end
    end

    test "keeps production-like lower opening when the final fast descent is moderate" do
      started_at = Time.zone.parse("2026-07-07 12:57:14 UTC")
      points = [
        point(started_at, 356.2, 5_569.951, 42.071, 6.73),
        point(started_at, 388.2, 4_294.276, 50.384, 48.49),
        point(started_at, 390.6, 4_189.749, 51.89, 37.87),
        point(started_at, 391.8, 4_148.028, 50.887, 30.43),
        point(started_at, 392.4, 4_131.652, 50.097, 23.87),
        point(started_at, 394.8, 4_095.501, 43.549, 8.91),
        point(started_at, 395.4, 4_090.491, 41.345, 6.67),
        point(started_at, 396.0, 4_087.066, 38.64, 4.21),
        point(started_at, 396.6, 4_084.84, 35.87, 2.27),
        point(started_at, 568.0, 980.0, 16.0, 13.0),
        point(started_at, 572.8, 946.0, 15.0, 12.5),
        point(started_at, 573.4, 940.369, 14.73, 8.97),
        point(started_at, 574.0, 935.0, 14.0, 7.0),
        point(started_at, 574.6, 931.0, 13.5, 6.0),
        point(started_at, 575.2, 928.0, 13.0, 5.5),
        point(started_at, 650.4, 417.652, 17.37, 9.63),
        point(started_at, 655.2, 383.835, 9.901, 14.51),
        point(started_at, 661.8, 319.341, 11.7, 18.02),
        point(started_at, 662.4, 308.955, 16.978, 16.24),
        point(started_at, 663.0, 300.456, 20.965, 12.1),
        point(started_at, 663.6, 294.517, 22.163, 8.31),
        point(started_at, 664.2, 290.491, 21.624, 5.61),
        point(started_at, 664.8, 287.645, 20.665, 4.26),
        point(started_at, 665.4, 285.136, 19.495, 4.16),
        point(started_at, 1_201.0, 9.75, 1.0, 0.0)
      ]

      bounds = DetectBounds.new(points).call

      assert_equal started_at + 573.4, bounds[:opening_at]
    end

    private

    def opening_sequence(started_at, flare)
      [
        point(started_at, 0, 2_000, 30, 25),
        point(started_at, 5, 1_875, 30, 25),
        point(started_at, 20, 1_425, 30, 25),
        *flare,
        point(started_at, 50, 1_000, 30, 25),
        point(started_at, 60, 750, 30, 25),
        *(61..81).map { |elapsed| point(started_at, elapsed, 740 - (elapsed - 61) * 5, 12, 5) },
        point(started_at, 200, 10, 0, 0)
      ]
    end

    def point(started_at, elapsed_seconds, altitude_m, horizontal_speed_mps, vertical_speed_mps)
      {
        recorded_at: started_at + elapsed_seconds,
        elapsed_seconds: elapsed_seconds,
        altitude_m: altitude_m,
        horizontal_speed_mps: horizontal_speed_mps,
        vertical_speed_mps: vertical_speed_mps
      }
    end
  end
end
