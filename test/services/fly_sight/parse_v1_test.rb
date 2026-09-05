require "test_helper"

module FlySight
  class ParseV1Test < ActiveSupport::TestCase
    test "parses recordings beyond the former GPS sample limit" do
      source = Tempfile.new([ "long-flight", ".csv" ])
      source.write("time,lat,lon,hMSL,velN,velE,velD\n(s),(deg),(deg),(m),(m/s),(m/s),(m/s)\n")
      started_at = Time.utc(2026, 9, 5)
      100_001.times do |index|
        source.write("#{(started_at + index / 20.0).iso8601(3)},45,6,1000,10,0,1\n")
      end
      source.flush
      session = ParseV1.new(source).call

      assert_equal 100_001, session.track_points.size
      assert_equal started_at, session.track_points.first[:recorded_at]
      assert_equal started_at + 5_000, session.track_points.reduce { |_, point| point }[:recorded_at]
    ensure
      session&.close
      source&.close!
    end

    test "parses FlySight V1 track rows" do
      parser = ParseV1.new(file_fixture("flysight_v1/SESSION.CSV").read, filename: "SESSION.CSV")
      session = parser.call

      assert_equal "flysight_v1", session.format
      assert_equal 4, session.track_points.size
      assert_empty session.sensor_samples
      assert_equal 45.0, session.track_points.first[:lat]
      assert_equal 3, session.track_points.first[:gps_fix]
    ensure
      session&.close
    end
  end
end
