module TunnelMedia
  # Associates clips with flights from timestamps alone.
  #
  # A clip starts when the pilot enters the airflow and lasts the flight time
  # booked for the whole timeslot, so the delay between a clip start and the end
  # of its flight is constant within a timeslot. Clips inside exactly one flight
  # interval are matched first; their median delay then recovers flights whose
  # recorded start is wrong.
  class Matcher
    Match = Struct.new(:clip, :flight, :method, keyword_init: true)

    def initialize(end_lag_tolerance_seconds: 40.0, minimum_reference_pairs: 2)
      @tolerance = end_lag_tolerance_seconds
      @minimum_reference_pairs = minimum_reference_pairs
    end

    # clips respond to recorded_at and timeslot_at; flights to started_at and ended_at.
    def call(clips, flights)
      flights = flights.select { |flight| flight.started_at && flight.ended_at }
      clips.group_by(&:timeslot_at).flat_map { |_timeslot, slot_clips| match_timeslot(slot_clips, flights) }
    end

    private

    def match_timeslot(clips, flights)
      matches = clips.filter_map do |clip|
        flight = only(flights.select { |candidate| clip.recorded_at.between?(candidate.started_at, candidate.ended_at) })
        Match.new(clip:, flight:, method: "interval") if flight
      end
      lag = reference_lag(matches)
      return matches unless lag

      matched = matches.map(&:clip)
      matches + (clips - matched).filter_map do |clip|
        flight = only(flights.select { |candidate| ((candidate.ended_at - clip.recorded_at) - lag).abs <= @tolerance })
        Match.new(clip:, flight:, method: "end_lag") if flight
      end
    end

    # One delay per flight, taken from its first clip: cameras share a start
    # and a relaunched flight has a second, shorter clip.
    def reference_lag(matches)
      lags = matches.group_by(&:flight).map { |flight, group| flight.ended_at - group.map { |match| match.clip.recorded_at }.min }.sort
      return if lags.size < @minimum_reference_pairs

      middle = lags.size / 2
      lags.size.odd? ? lags[middle] : (lags[middle - 1] + lags[middle]) / 2.0
    end

    def only(candidates)
      candidates.first if candidates.size == 1
    end
  end
end
