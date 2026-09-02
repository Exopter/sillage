require "test_helper"

class ExoFdr::ImportServiceTest < ActiveSupport::TestCase
  test "anchors intermittent invalid UTC samples to the monotonic recording timeline" do
    records = [
      { "type" => "unknown", "timestamp_us" => 1_000_000 },
      gps_record(timestamp_us: 2_000_000, longitude_deg_e7: 10_000_000),
      gps_record(
        timestamp_us: 7_000_000,
        longitude_deg_e7: 60_000_000,
        utc: Time.utc(2026, 8, 18, 12, 0, 6)
      ),
      gps_record(timestamp_us: 8_000_000, longitude_deg_e7: 70_000_000),
      gps_record(
        timestamp_us: 9_000_000,
        longitude_deg_e7: 80_000_000,
        utc: Time.utc(2026, 8, 18, 12, 0, 8)
      )
    ]
    service = ExoFdr::ImportService.new(nil)

    points, = service.send(:records_to_samples, records)

    assert_equal Time.utc(2026, 8, 18, 12, 0, 0), service.send(:started_at_for, records)
    assert_equal [
      Time.utc(2026, 8, 18, 12, 0, 1),
      Time.utc(2026, 8, 18, 12, 0, 6),
      Time.utc(2026, 8, 18, 12, 0, 7),
      Time.utc(2026, 8, 18, 12, 0, 8)
    ], points.map { |point| point.fetch(:recorded_at) }
    assert_equal points.map { |point| point.fetch(:recorded_at) }.sort,
      points.map { |point| point.fetch(:recorded_at) }
  end

  private

  def gps_record(timestamp_us:, longitude_deg_e7:, utc: nil)
    {
      "type" => "gps_pvt",
      "timestamp_us" => timestamp_us,
      "utc_valid" => utc ? 1 : 0,
      "year" => utc&.year,
      "month" => utc&.month,
      "day" => utc&.day,
      "hour" => utc&.hour,
      "minute" => utc&.min,
      "second" => utc&.sec,
      "nano_seconds" => utc&.nsec.to_i,
      "latitude_deg_e7" => 440_000_000,
      "longitude_deg_e7" => longitude_deg_e7,
      "height_msl_mm" => 200_000,
      "velocity_north_mm_s" => 0,
      "velocity_east_mm_s" => 50_000,
      "velocity_down_mm_s" => 0,
      "horizontal_accuracy_mm" => 1_000,
      "vertical_accuracy_mm" => 1_500,
      "speed_accuracy_mm_s" => 500,
      "heading_motion_deg_e5" => 9_000_000,
      "heading_accuracy_deg_e5" => 10_000,
      "fix_type" => 3,
      "satellites" => 12
    }
  end
end
