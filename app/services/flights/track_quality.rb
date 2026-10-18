module Flights
  # Derived geometry only. Never edits or removes the recorded measurements.
  class TrackQuality
    VERSION = 1
    MAX_HORIZONTAL_ACCURACY_M = 10.0
    MAX_VERTICAL_ACCURACY_M = 20.0
    MAX_SPEED_ACCURACY_MPS = 1.0
    MAX_GAP_SECONDS = 5.0
    MIN_POSITION_RESIDUAL_M = 25.0
    MIN_ALTITUDE_RESIDUAL_M = 20.0

    Result = Data.define(:points, :rejected_count, :gaps)

    def initialize(points)
      @points = SampleOrder.sort(points) { |point| point[:elapsed_seconds].to_f }
      @has_altitude = @points.any? { |point| !point[:altitude_m].nil? }
    end

    def call
      accepted = []
      gaps = []
      candidates = @points.each_with_index.filter_map { |point, index| [ point, index ] if usable?(point) }
      rejected = @points.size - candidates.size
      previous_index = nil
      segment = 0
      candidates.each_with_index do |(point, raw_index), index|
        previous = accepted.last
        reasons = previous ? discontinuities(previous, point) : []
        following = candidates[index + 1]&.first
        if previous && following && reasons.any? { |reason| reason.end_with?("discontinuity") } &&
            discontinuities(previous, following).empty?
          # An isolated excursion which immediately returns to the expected
          # trajectory is not a new segment to plot on the other side of Earth.
          rejected += 1
          next
        end
        reasons << "unreliable_gps" if previous_index && raw_index > previous_index + 1
        if reasons.any?
          segment += 1
          gaps << { start: previous[:elapsed_seconds], finish: point[:elapsed_seconds], reasons: reasons }
        end
        accepted << point.merge(segment: segment)
        previous_index = raw_index
      end
      Result.new(points: accepted, rejected_count: rejected, gaps: gaps)
    end

    private

    def usable?(point)
      return false unless number(point, :elapsed_seconds) && number(point, :lat)&.between?(-90, 90) && number(point, :lon)&.between?(-180, 180)
      return false if @has_altitude && !number(point, :altitude_m)
      return false if point[:gps_fix] && ![ 3, 4 ].include?(point[:gps_fix].to_i)
      return false if point[:gps_flags] && (point[:gps_flags].to_i & 1).zero?

      # Older FlySight files may omit quality fields. Missing is unknown, not zero.
      { horizontal_accuracy_m: MAX_HORIZONTAL_ACCURACY_M, vertical_accuracy_m: MAX_VERTICAL_ACCURACY_M,
        speed_accuracy_mps: MAX_SPEED_ACCURACY_MPS }.all? do |key, maximum|
        point[key].nil? || number(point, key)&.between?(0, maximum)
      end
    end

    def discontinuities(previous, point)
      elapsed = point[:elapsed_seconds] - previous[:elapsed_seconds]
      reasons = []
      reasons << "gps_gap" if elapsed > MAX_GAP_SECONDS || elapsed <= 0
      return reasons unless elapsed.positive? && elapsed <= MAX_GAP_SECONDS

      distance = horizontal_distance(previous, point)
      speed = [ previous[:horizontal_speed_mps], point[:horizontal_speed_mps] ].filter_map { |v| Float(v, exception: false) }.max || 150.0
      tolerance = MIN_POSITION_RESIDUAL_M + 3 * [ previous, point ].sum { |row| number(row, :horizontal_accuracy_m).to_f }
      reasons << "position_discontinuity" if distance > speed.abs * elapsed + tolerance

      before, after = [ previous, point ].map { |row| number(row, :altitude_m) }
      velocities = [ previous, point ].filter_map { |row| number(row, :vertical_speed_mps) }
      if before && after
        expected = velocities.any? ? -velocities.sum / velocities.length * elapsed : 0.0
        allowance = velocities.any? ? 0.0 : 150.0 * elapsed
        tolerance = MIN_ALTITUDE_RESIDUAL_M + 3 * [ previous, point ].sum { |row| number(row, :vertical_accuracy_m).to_f }
        reasons << "altitude_discontinuity" if ((after - before) - expected).abs > tolerance + allowance
      end
      reasons
    end

    def horizontal_distance(a, b)
      radians = Math::PI / 180
      latitude = (b[:lat] - a[:lat]) * radians
      longitude = (b[:lon] - a[:lon]) * radians
      h = Math.sin(latitude / 2)**2 + Math.cos(a[:lat] * radians) * Math.cos(b[:lat] * radians) * Math.sin(longitude / 2)**2
      12_742_000 * Math.asin(Math.sqrt(h.clamp(0, 1)))
    end

    def number(point, key)
      value = Float(point[key], exception: false)
      value if value&.finite?
    end
  end
end
