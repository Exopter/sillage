require "test_helper"

class ExoFdr::ActivityAssessmentTest < ActiveSupport::TestCase
  test "GPS drift remains stationary even when cumulative distance is substantial" do
    result = assess((0..120).map { |time| gps(time, longitude: 10 + (time.even? ? 0.00001 : -0.00001)) })
    assert_equal "stationary", result["classification"]
    assert_equal 120, result["duration_seconds"]
    assert_operator result["max_radius_m"], :>, 1
  end

  test "sustained horizontal and vertical movement are kept" do
    [ { speed: 3 }, { down: 2 } ].each do |movement|
      assert_equal "moving", assess((0..30).map { |time| gps(time, **movement) })["classification"]
    end
  end

  test "slow positional movement and a return to the origin are not stationary" do
    result = assess((0..120).map { |time| gps(time, longitude: 10 + [ time, 120 - time ].min * 0.00001) })
    assert_equal "moving", result["classification"]
  end

  test "a brief real movement or isolated GPS spike needs review" do
    speed = (0..120).map { |time| gps(time, speed: time.between?(60, 62) ? 3 : 0.03) }
    spike = (0..120).map { |time| gps(time, longitude: time == 60 ? 11 : 10) }
    [ speed, spike ].each { |records| assert_equal "needs_review", assess(records)["classification"] }
  end

  test "missing fixes poor accuracy and missing speed uncertainty never prove immobility" do
    [ { "fix_type" => 0 }, { "horizontal_accuracy_mm" => 30_000 }, { "gps_flags" => 0 },
      { "speed_accuracy_mm_s" => nil }, { "latitude_deg_e7" => Float::NAN } ].each do |invalid|
      assert_equal "needs_review", assess((0..30).map { |time| gps(time).merge(invalid) })["classification"]
    end
  end

  test "data gaps short data and operator markers stay visible" do
    gaps = (0..120).reject { |time| time.between?(50, 55) }.map { |time| gps(time) }
    short = (0..4).map { |time| gps(time) }
    marked = (0..30).map { |time| gps(time) } + [ { "type" => "marker", "timestamp_us" => 15_000_000 } ]
    [ gaps, short, marked ].each { |records| assert_equal "needs_review", assess(records)["classification"] }
  end

  test "initial GPS acquisition gets a bounded grace period only at recorder startup" do
    boot = [ { "type" => "system_event", "timestamp_us" => 3_000_000 } ]
    startup = boot + (10..40).map { |time| gps(time) }
    assert_equal "stationary", assess(startup)["classification"]
    delayed = [ { "type" => "system_event", "timestamp_us" => 100_000_000 } ] + (107..140).map { |time| gps(time) }
    assert_equal "needs_review", assess(delayed)["classification"]
    too_late = boot + (20..50).map { |time| gps(time) }
    assert_equal "needs_review", assess(too_late)["classification"]
  end

  test "system events are technical while sensor-only data stays available for review" do
    assert_equal "technical", assess([ { "type" => "system_event", "timestamp_us" => 1 } ])["classification"]
    assert_equal "technical", assess([])["classification"]
    assert_equal "needs_review", assess([ { "type" => "imu", "timestamp_us" => 1 } ])["classification"]
  end

  test "damaged source data is never silently archived" do
    assessment = ExoFdr::ActivityAssessment.new
    assert_equal "needs_review", assessment.result(stats: { "partial_tail_bytes" => 3 })["classification"]
  end

  private

  def assess(records)
    assessment = ExoFdr::ActivityAssessment.new
    records.each { |record| assessment.observe(record) }
    assessment.result
  end

  def gps(time, longitude: 10, speed: 0.03, down: 0)
    { "type" => "gps_pvt", "timestamp_us" => time * 1_000_000, "fix_type" => 3, "gps_flags" => 1,
      "latitude_deg_e7" => 440_000_000, "longitude_deg_e7" => longitude * 10_000_000,
      "height_msl_mm" => 100_000, "horizontal_accuracy_mm" => 1_000, "vertical_accuracy_mm" => 2_000,
      "speed_accuracy_mm_s" => 50, "velocity_north_mm_s" => speed * 1_000, "velocity_east_mm_s" => 0,
      "velocity_down_mm_s" => down * 1_000 }
  end
end
