module Flights
  class DetectLanding
    GROUND_CONFIRMATION_SECONDS = 8.0
    MAX_SAMPLE_GAP_SECONDS = 5.0
    MAX_GROUND_SPEED_MPS = 3.0
    MAX_VERTICAL_SPEED_MPS = 1.0
    MAX_ALTITUDE_SPREAD_M = 3.0
    GROUND_ALTITUDE_MARGIN_M = 15.0
    TOUCHDOWN_LOOKBEHIND_SECONDS = 5.0

    # Points are ordered by elapsed time by the calling analysis service.
    def initialize(points, after:, horizontal_speed: true)
      @points = points
      @after = after
      @horizontal_speed = horizontal_speed
    end

    def call
      floor = @points.filter_map do |point|
        elapsed = number(point, :elapsed_seconds)
        number(point, :altitude_m) if elapsed && elapsed >= @after
      end.min
      return unless floor

      start_index = previous_elapsed = minimum = maximum = nil
      @points.each_with_index do |point, index|
        elapsed = number(point, :elapsed_seconds)
        altitude = number(point, :altitude_m)
        unless elapsed && altitude && elapsed >= @after && altitude <= floor + GROUND_ALTITUDE_MARGIN_M && ground_motion?(point)
          start_index = previous_elapsed = minimum = maximum = nil
          next
        end

        if !start_index || elapsed - previous_elapsed > MAX_SAMPLE_GAP_SECONDS ||
            ([ maximum, altitude ].max - [ minimum, altitude ].min) > MAX_ALTITUDE_SPREAD_M
          start_index = index
          minimum = maximum = altitude
        end
        minimum = [ minimum, altitude ].min
        maximum = [ maximum, altitude ].max
        previous_elapsed = elapsed

        if elapsed - number(@points[start_index], :elapsed_seconds) >= GROUND_CONFIRMATION_SECONDS
          return touchdown_point(start_index)
        end
      end

      nil
    end

    private

    def ground_motion?(point)
      vertical = number(point, :vertical_speed_mps)
      return false unless vertical && vertical.abs <= MAX_VERTICAL_SPEED_MPS
      return true unless @horizontal_speed

      horizontal = number(point, :horizontal_speed_mps)
      horizontal && horizontal.between?(0.0, MAX_GROUND_SPEED_MPS)
    end

    # Ground confirmation can follow a short landing run. Keep the beginning of
    # the stable altitude segment instead of waiting for horizontal motion to stop.
    def touchdown_point(index)
      start = @points[index]
      earliest = [ number(start, :elapsed_seconds) - TOUCHDOWN_LOOKBEHIND_SECONDS, @after ].max
      altitude = number(start, :altitude_m)
      while index.positive?
        previous = @points[index - 1]
        elapsed = number(previous, :elapsed_seconds)
        height = number(previous, :altitude_m)
        vertical = number(previous, :vertical_speed_mps)
        break unless elapsed && height && vertical && elapsed >= earliest
        break if number(@points[index], :elapsed_seconds) - elapsed > MAX_SAMPLE_GAP_SECONDS
        break if vertical.abs > MAX_VERTICAL_SPEED_MPS || (height - altitude).abs > MAX_ALTITUDE_SPREAD_M

        index -= 1
      end
      @points[index]
    end

    def number(point, key)
      value = Float(point[key], exception: false)
      value if value&.finite?
    end
  end
end
