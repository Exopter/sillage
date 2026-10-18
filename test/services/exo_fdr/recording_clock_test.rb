require "test_helper"

class ExoFdr::RecordingClockTest < ActiveSupport::TestCase
  test "date and time must both be valid and fully resolved regardless of other flags" do
    (0..255).each do |flags|
      clock = ExoFdr::RecordingClock.new([ gps(utc_valid: flags) ])
      if [ 0, 1, 2 ].all? { |bit| flags[bit] == 1 }
        assert_equal Time.utc(2026, 10, 16, 9, 29, 10), clock.started_at, "flags=#{flags}"
      else
        assert_nil clock.started_at, "flags=#{flags}"
      end
    end
  end

  test "startup GPS dates cannot anchor the recording before UTC is resolved" do
    clock = ExoFdr::RecordingClock.new
    clock.observe({ "type" => "system_event", "timestamp_us" => 3_753_139 })
    clock.observe(gps(year: 2020, utc_valid: 0xf0, timestamp_us: 10_451_020))
    clock.observe(gps(year: 2020, utc_valid: 0xf2, timestamp_us: 278_404_631))
    clock.observe(gps(utc_valid: 0xf3, timestamp_us: 299_554_623))
    assert_nil clock.started_at

    clock.observe(gps(utc_valid: 0xf7, timestamp_us: 355_774_704, nano_seconds: 101_729_376))
    assert_equal 3_753_139, clock.origin_us
    assert_in_delta Time.utc(2026, 10, 16, 9, 23, 18, 80_164).to_f, clock.started_at.to_f, 0.000001

    clock.observe(gps(year: 2020, utc_valid: 0xf0, timestamp_us: 356_000_000))
    assert_equal 2026, clock.started_at.year
  end

  private

  def gps(**attributes)
    { "type" => "gps_pvt", "timestamp_us" => 1_000_000,
      "utc_valid" => 7, "year" => 2026, "month" => 10, "day" => 16,
      "hour" => 9, "minute" => 29, "second" => 10, "nano_seconds" => 0 }.merge(attributes.stringify_keys)
  end
end
