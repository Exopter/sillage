require "test_helper"

module Jumps
  class DetectBoundsTest < ActiveSupport::TestCase
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
        point(started_at, 95.0, 1_560.0, 10.0, 4.8)
      ]

      bounds = DetectBounds.new(points).call

      assert_equal started_at + 51.0, bounds[:opening_at]
    end

    private

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
