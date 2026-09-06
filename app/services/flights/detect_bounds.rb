module Flights
  class DetectBounds
    HORIZONTAL_EXIT_SPEED_MPS = 20.0
    FREEFALL_VERTICAL_SPEED_MPS = 12.0
    EXIT_ONSET_VERTICAL_SPEED_MPS = 2.5
    FREEFALL_LOOKAHEAD_SECONDS = 4.0
    FREEFALL_MIN_ALTITUDE_LOSS_M = 20.0
    FREEFALL_MIN_AVG_DESCENT_MPS = 6.0
    AIRCRAFT_CLIMB_GAIN_M = 50.0
    OPENING_FAST_DESCENT_MPS = 12.0
    OPENING_FAST_LOOKBEHIND_SECONDS = 8.0
    OPENING_SLOW_DESCENT_MPS = 10.0
    OPENING_SLOW_POINTS = 4
    OPENING_TYPICAL_MIN_HEIGHT_M = 600.0
    OPENING_TYPICAL_MAX_HEIGHT_M = 1_500.0

    def initialize(points)
      @points = FlightImports::AnalysisStore.sort(points) { |point| point[:elapsed_seconds] || 0 }
      @next_invalid = sequence
      next_invalid = @points.size
      (@points.size - 1).downto(0) do |index|
        next_invalid = index unless elapsed_seconds(@points[index]) && altitude_m(@points[index])
        @next_invalid << next_invalid
      end
      @fast_counts = sequence << 0
      @speed_counts = sequence << 0
      @points.each do |point|
        @fast_counts << @fast_counts.last + (fast_freefall?(point) ? 1 : 0)
        @speed_counts << @speed_counts.last + (vertical_speed_mps(point) ? 1 : 0)
      end
    end

    def call
      return {} if @points.empty?

      exit_point = detect_exit || @points.first
      opening_point = detect_opening(exit_point) || fallback_opening(exit_point)
      landing_point = detect_landing || @points.last

      {
        exit_at: exit_point[:recorded_at],
        opening_at: opening_point&.fetch(:recorded_at, nil),
        landing_at: landing_point[:recorded_at]
      }
    end

    private

    def sequence
      @points.respond_to?(:store) ? @points.store.sequence : []
    end

    def detect_exit
      detect_aircraft_exit || detect_movement_exit
    end

    def detect_aircraft_exit
      @points.each_with_index do |_point, index|
        next unless sustained_freefall_from?(index)

        return exit_onset_point(index)
      end

      nil
    end

    def detect_movement_exit
      vertical_exit = @points.find { |point| fast_freefall?(point) }
      return vertical_exit if vertical_exit
      return nil if aircraft_climb?

      @points.find do |point|
        point[:horizontal_speed_mps].to_f >= HORIZONTAL_EXIT_SPEED_MPS
      end
    end

    def sustained_freefall_from?(index)
      last_index = freefall_window_end(index)
      return false unless last_index && last_index > index

      first, last = @points.values_at(index, last_index)
      duration = elapsed_seconds(last) - elapsed_seconds(first)
      return false unless duration.positive?

      altitude_loss = altitude_m(first) - altitude_m(last)
      return false unless altitude_loss >= FREEFALL_MIN_ALTITUDE_LOSS_M
      return false unless (altitude_loss / duration) >= FREEFALL_MIN_AVG_DESCENT_MPS

      @fast_counts[last_index + 1] > @fast_counts[index] || @speed_counts[last_index + 1] == @speed_counts[index]
    end

    def freefall_window_end(index)
      point = @points[index]
      start_elapsed = elapsed_seconds(point)
      return unless start_elapsed && altitude_m(point)

      stop = @next_invalid[@points.size - 1 - index]
      last = ((index...stop).bsearch { |i| elapsed_seconds(@points[i]) > start_elapsed + FREEFALL_LOOKAHEAD_SECONDS } || stop) - 1
      if last == index && elapsed_seconds(@points[index + 1]) && altitude_m(@points[index + 1])
        last += 1
      end
      last
    end

    def exit_onset_point(index)
      return @points.first if index.zero?

      last = freefall_window_end(index) || index
      onset = (index..last).find { |i| vertical_speed_mps(@points[i]).to_f >= EXIT_ONSET_VERTICAL_SPEED_MPS }
      @points[onset || index]
    end

    def detect_opening(exit_point)
      best = nil
      best_score = nil
      candidate_active = false
      last_fast = nil
      @points.each_with_index do |point, index|
        next if point[:elapsed_seconds].to_f <= exit_point[:elapsed_seconds].to_f + 8.0
        slow_window = @points[index, OPENING_SLOW_POINTS].to_a
        candidate = slow_window.size == OPENING_SLOW_POINTS &&
          last_fast && elapsed_seconds(last_fast).to_f >= elapsed_seconds(point).to_f - OPENING_FAST_LOOKBEHIND_SECONDS &&
          slow_window.all? { |window_point| vertical_speed_mps(window_point).to_f < OPENING_SLOW_DESCENT_MPS }

        if candidate && !candidate_active
          score = opening_score(point, index)
          if !best_score || (score <=> best_score).negative?
            best = point
            best_score = score
          end
        end
        candidate_active = candidate
        last_fast = point if vertical_speed_mps(point).to_f >= OPENING_FAST_DESCENT_MPS
      end

      best
    end

    def opening_score(candidate, index)
      height = height_m(candidate)
      return [ 2, index ] unless height

      if height.between?(OPENING_TYPICAL_MIN_HEIGHT_M, OPENING_TYPICAL_MAX_HEIGHT_M)
        [ 0, height ]
      elsif height > OPENING_TYPICAL_MAX_HEIGHT_M
        [ 1, height - OPENING_TYPICAL_MAX_HEIGHT_M ]
      else
        [ 1, OPENING_TYPICAL_MIN_HEIGHT_M - height ]
      end
    end

    def height_m(point)
      altitude = altitude_m(point)
      floor = altitude_floor_m
      return nil unless altitude && floor

      altitude - floor
    end

    def altitude_floor_m
      @altitude_floor_m ||= @points.lazy.filter_map { |point| altitude_m(point) }.min
    end

    def fallback_opening(exit_point)
      return nil if @points.size < 4

      target_elapsed = exit_point[:elapsed_seconds].to_f + ((@points.last[:elapsed_seconds].to_f - exit_point[:elapsed_seconds].to_f) * 0.7)
      @points.min_by { |point| (point[:elapsed_seconds].to_f - target_elapsed).abs }
    end

    def detect_landing
      active_point = nil
      @points.each do |point|
        active_point = point if point[:horizontal_speed_mps].to_f >= 2.5 || point[:vertical_speed_mps].to_f.abs >= 1.0
      end

      active_point
    end

    def aircraft_climb?
      start_altitude = altitude_m(@points.first)
      return false unless start_altitude

      max_altitude = @points.lazy.filter_map { |point| altitude_m(point) }.max
      max_altitude && (max_altitude - start_altitude) >= AIRCRAFT_CLIMB_GAIN_M
    end

    def fast_freefall?(point)
      vertical_speed = vertical_speed_mps(point)
      vertical_speed && vertical_speed >= FREEFALL_VERTICAL_SPEED_MPS
    end

    def elapsed_seconds(point)
      numeric(point, :elapsed_seconds)
    end

    def altitude_m(point)
      numeric(point, :altitude_m)
    end

    def vertical_speed_mps(point)
      numeric(point, :vertical_speed_mps)
    end

    def numeric(point, key)
      value = point&.fetch(key, nil)
      return nil if value.nil?

      number = value.to_f
      number.finite? ? number : nil
    end
  end
end
