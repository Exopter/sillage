require "test_helper"

class TunnelMedia::MatcherTest < ActiveSupport::TestCase
  Clip = Struct.new(:recorded_at, :timeslot_at)
  FlightWindow = Struct.new(:name, :started_at, :ended_at)

  SLOT = Time.utc(2026, 11, 16, 15, 0)

  # Timeline observed on 2026-11-16 at Inclined Slovenia (UTC).
  def flights
    [
      flight("89", "15:18:47", "15:21:27"),
      flight("90", "15:24:52", "15:26:42"),
      flight("91", "15:29:48", "15:32:12"),
      flight("92", "15:38:47", "15:41:09")
    ]
  end

  test "matches clips inside one flight and recovers a late-started flight from the timeslot delay" do
    clips = [ clip("15:19:16"), clip("15:24:28"), clip("15:29:58"), clip("15:38:58") ]

    matches = TunnelMedia::Matcher.new.call(clips, flights)

    assert_equal %w[89 91 92 90], matches.map { |match| match.flight.name }
    assert_equal %w[interval interval interval end_lag], matches.map(&:method)
  end

  test "leaves a clip unmatched without enough reference pairs in its timeslot" do
    matches = TunnelMedia::Matcher.new.call([ clip("15:19:16"), clip("15:24:28") ], flights)

    assert_equal [ "89" ], matches.map { |match| match.flight.name }
  end

  test "leaves clips far from every flight unmatched" do
    clips = [ clip("15:19:16"), clip("15:29:58"), clip("15:04:42"), clip("15:10:15") ]

    assert_equal %w[89 91], TunnelMedia::Matcher.new.call(clips, flights).map { |match| match.flight.name }
  end

  test "does not reuse the delay of another timeslot" do
    other_slot = Clip.new(Time.utc(2026, 11, 16, 15, 24, 28), SLOT + 30.minutes)
    clips = [ clip("15:19:16"), clip("15:29:58"), other_slot ]

    assert_equal 2, TunnelMedia::Matcher.new.call(clips, flights).size
  end

  test "cameras sharing a clip start count once in the reference delay" do
    clips = [ clip("15:19:16"), clip("15:19:16"), clip("15:19:17"), clip("15:24:28") ]

    assert_equal %w[89 89 89], TunnelMedia::Matcher.new.call(clips, flights).map { |match| match.flight.name }
  end

  test "a five-second debrief can follow a measured take by more than two minutes" do
    take = clip("15:00:00")
    marker = flight("late", "15:04:36", "15:04:41")
    matcher = TunnelMedia::Matcher.new
    assert_empty matcher.call([ take ], [ marker ], durations: { take => 120 })
    assert_empty matcher.call([ take ], [ marker ], debriefed: [ marker ])
    match, = matcher.call([ take ], [ marker ], debriefed: [ marker ], durations: { take => 120 })
    assert_equal [ marker, "post_flight_debrief" ], [ match.flight, match.method ]
  end

  test "a later take, an intervening flight, competing debriefs or excessive delay break the association" do
    take = clip("15:00:00")
    marker = flight("late", "15:02:15", "15:02:20")
    other = flight("other", "15:02:26", "15:02:31")
    match = ->(flights, blocked = []) do
      TunnelMedia::Matcher.new.call([ take ], flights, debriefed: flights, durations: { take => 120 }, blocked:)
    end
    assert_empty match.call([ marker ], [ clip("15:01:10") ])
    assert_empty match.call([ marker, other ])
    assert_empty match.call([ marker, flight("other", "15:01:10", "15:01:35") ])
    assert_empty match.call([ flight("too late", "15:06:00", "15:06:05") ])
  end

  test "small camera clock differences match a normal flight only when it is unique" do
    take = clip("15:00:00")
    nearby = flight("flight", "15:00:03", "15:02:00")
    matcher = TunnelMedia::Matcher.new
    assert_equal [ "near_start" ], matcher.call([ take ], [ nearby ]).map(&:method)
    assert_empty matcher.call([ take ], [ nearby, flight("other", "15:00:04", "15:02:02") ])
    assert_empty matcher.call([ take ], [ flight("short", "15:00:03", "15:00:08") ])
  end

  private

  def clip(time)
    Clip.new(at(time), SLOT)
  end

  def flight(name, started, ended)
    FlightWindow.new(name, at(started), at(ended))
  end

  def at(time)
    Time.utc(2026, 11, 16, *time.split(":").map(&:to_i))
  end
end
