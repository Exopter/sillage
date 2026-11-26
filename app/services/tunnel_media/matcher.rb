module TunnelMedia
  class Matcher
    Match = Struct.new(:clip, :flight, :method, keyword_init: true)
    START_TOLERANCE = 5.seconds
    SHORT_RECORD = 10.seconds
    MAX_DEBRIEF_DELAY = 3.minutes

    def initialize(end_lag_tolerance_seconds: 40.0, minimum_reference_pairs: 2)
      @tolerance = end_lag_tolerance_seconds
      @minimum_reference_pairs = minimum_reference_pairs
    end

    # Existing assignments supply timing references and prevent a second take
    # from being claimed by the same post-flight debrief.
    def call(clips, flights, assigned: {}, debriefed: Set.new, durations: {}, blocked: [])
      flights = flights.select { |flight| flight.started_at && flight.ended_at }
      matches = clips.group_by(&:timeslot_at).flat_map do |slot, takes|
        references = assigned.select { |clip, _| clip.timeslot_at == slot }
        match_timeslot(takes, flights, references)
      end
      owners = assigned.merge(matches.to_h { |match| [ match.clip, match.flight ] })
      available = clips - owners.keys
      markers = (flights - owners.values).select do |flight|
        debriefed.include?(flight) && (flight.ended_at - flight.started_at).between?(0, SHORT_RECORD)
      end
      timeline = (clips + assigned.keys + blocked).sort_by(&:recorded_at)
      proposals = markers.filter_map do |flight|
        # Look only at the immediately preceding take, including excluded takes
        # and other slots. An intervening flight breaks the sequence.
        index = timeline.bsearch_index { |take| take.recorded_at >= flight.started_at } || timeline.size
        next if index.zero?
        clip = timeline[index - 1]
        next unless available.include?(clip)

        next if flight.started_at - clip.recorded_at > 1.hour
        duration = durations[clip] || (yield(clip) if block_given?)
        next unless duration && duration >= TunnelVideo::MINIMUM_DURATION_SECONDS
        delay = flight.started_at - (clip.recorded_at + duration)
        Match.new(clip:, flight:, method: "post_flight_debrief") if delay.between?(-START_TOLERANCE, MAX_DEBRIEF_DELAY)
      end
      unique = proposals.group_by(&:clip).values.filter_map { |group| only(group) }
      matches + unique.reject do |match|
        flights.any? { |other| other != match.flight && other.started_at < match.flight.started_at && other.ended_at >= match.clip.recorded_at }
      end
    end

    private

    def match_timeslot(clips, flights, references)
      matches = clips.filter_map do |clip|
        inside = flights.select { |flight| clip.recorded_at.between?(flight.started_at, flight.ended_at) }
        if inside.any?
          flight = only(inside)
          Match.new(clip:, flight:, method: "interval") if flight
        else
          flight = only(flights.select { |f| f.ended_at - f.started_at > SHORT_RECORD && (f.started_at - clip.recorded_at).between?(0, START_TOLERANCE) })
          Match.new(clip:, flight:, method: "near_start") if flight
        end
      end
      references = references.select { |clip, flight| clip.recorded_at.between?(flight.started_at - START_TOLERANCE, flight.ended_at) && flight.ended_at - flight.started_at > SHORT_RECORD }
      pairs = references.merge(matches.to_h { |m| [ m.clip, m.flight ] })
      lag = median(pairs.group_by { |_clip, flight| flight }.map do |flight, group|
        flight.ended_at - group.map { |clip, _| clip.recorded_at }.min
      end)
      return matches unless lag

      matches + (clips - pairs.keys).filter_map do |clip|
        next if flights.any? { |flight| clip.recorded_at.between?(flight.started_at, flight.ended_at) }
        flight = only(flights.select { |f| f.ended_at - f.started_at > SHORT_RECORD && ((f.ended_at - clip.recorded_at) - lag).abs <= @tolerance })
        Match.new(clip:, flight:, method: "end_lag") if flight
      end
    end

    def median(values)
      return if values.size < @minimum_reference_pairs
      sorted = values.sort
      (sorted[(sorted.size - 1) / 2] + sorted[sorted.size / 2]) / 2.0
    end

    def only(candidates)
      candidates.first if candidates.size == 1
    end
  end
end
