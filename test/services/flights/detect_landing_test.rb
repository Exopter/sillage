require "test_helper"

module Flights
  class DetectLandingTest < ActiveSupport::TestCase
    test "ends canopy at touchdown despite later walking and isolated GPS motion" do
      points = (0..60).map do |elapsed|
        if elapsed < 20
          point(elapsed, altitude: 224 + (20 - elapsed) * 5, horizontal: 14, vertical: 5)
        elsif elapsed < 23
          point(elapsed, altitude: 224, horizontal: 6, vertical: 0)
        else
          point(elapsed, altitude: 224 + Math.sin(elapsed) * 0.2, horizontal: 1, vertical: 0.1)
        end
      end
      points[45] = point(45, altitude: 224, horizontal: 4, vertical: 1.5)
      points[55] = point(55, altitude: 225, horizontal: 12, vertical: 0.1)

      assert_equal 20, landing(points)[:elapsed_seconds]
    end

    test "brief low altitude flare does not end canopy before renewed descent" do
      points = (0..50).map do |elapsed|
        case elapsed
        when 0...5 then point(elapsed, altitude: 110, horizontal: 2, vertical: 0)
        when 5...15 then point(elapsed, altitude: 110 - (elapsed - 5), horizontal: 12, vertical: 1.5)
        else point(elapsed, altitude: 100, horizontal: 1, vertical: 0)
        end
      end

      assert_equal 15, landing(points)[:elapsed_seconds]
    end

    test "sustained airborne slowdown well above the landing altitude is not a landing" do
      points = (0..50).map do |elapsed|
        case elapsed
        when 0...15 then point(elapsed, altitude: 300, horizontal: 2, vertical: 0)
        when 15...35 then point(elapsed, altitude: 300 - (elapsed - 15) * 10, horizontal: 12, vertical: 10)
        else point(elapsed, altitude: 100, horizontal: 1, vertical: 0)
        end
      end

      assert_equal 35, landing(points)[:elapsed_seconds]
    end

    test "confirmation uses elapsed time rather than sample count" do
      points = 100.times.map { |index| point(index / 100.0, altitude: 224, horizontal: 0, vertical: 0) }
      assert_nil landing(points)
    end

    test "gaps and missing telemetry do not confirm a landing" do
      points = [ 0, 1, 2, 20, 21, 22 ].map { |elapsed| point(elapsed, altitude: 224, horizontal: 0, vertical: 0) }
      assert_nil landing(points)
      %i[altitude_m horizontal_speed_mps vertical_speed_mps].each do |key|
        missing = (0..20).map { |elapsed| point(elapsed, altitude: 224, horizontal: 0, vertical: 0).merge(key => nil) }
        assert_nil landing(missing)
      end
    end

    test "an airborne recording ending in descent has no confirmed landing" do
      points = (0..40).map { |elapsed| point(elapsed, altitude: 300 - elapsed * 4, horizontal: 12, vertical: 4) }
      assert_nil landing(points)
    end

    test "ground before opening and low departure elevation do not determine landing" do
      points = (0..10).map { |elapsed| point(elapsed, altitude: 0, horizontal: 0, vertical: 0) }
      points += (20..40).map { |elapsed| point(elapsed, altitude: 500, horizontal: 0, vertical: 0) }
      assert_equal 20, landing(points, after: 20)[:elapsed_seconds]
    end

    private

    def landing(points, after: 0)
      DetectLanding.new(points, after:).call
    end

    def point(elapsed, altitude:, horizontal:, vertical:)
      {
        recorded_at: Time.utc(2026, 9, 1) + elapsed, elapsed_seconds: elapsed,
        altitude_m: altitude, horizontal_speed_mps: horizontal, vertical_speed_mps: vertical
      }
    end
  end
end
