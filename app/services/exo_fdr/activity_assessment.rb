module ExoFdr
  # Conservative source classification, independent of flight-phase detection.
  # An uncertain measurement can prevent archiving, but cannot prove movement.
  class ActivityAssessment
    VERSION = 1
    MIN_STATIONARY_SECONDS = 20.0
    MAX_GPS_GAP_SECONDS = 2.0
    MOVEMENT_SECONDS = 5.0
    STARTUP_GPS_GRACE_SECONDS = 10.0
    EARTH_RADIUS_M = 6_371_000.0

    def initialize
      @types = Hash.new(0)
      @gps = []
      @gps_count = 0
    end

    def observe(record)
      timestamp = record.fetch("timestamp_us").to_i
      @min_us = timestamp if !@min_us || timestamp < @min_us
      @max_us = timestamp if !@max_us || timestamp > @max_us
      @types[record.fetch("type")] += 1
      return unless record["type"] == "gps_pvt"

      @gps_count += 1
      point = gps_point(record, timestamp)
      @gps << point if point
    end

    def result(stats: {})
      duration = @min_us ? (@max_us - @min_us) / 1_000_000.0 : 0.0
      summary = { "version" => VERSION, "duration_seconds" => duration,
        "min_us" => @min_us, "max_us" => @max_us, "record_counts" => @types,
        "gps_points" => @gps_count, "usable_gps_points" => @gps.size }
      if %w[crc_errors malformed_headers skipped_bytes partial_tail_bytes sequence_gaps].any? { |key| stats[key].to_i.positive? }
        return decision(summary, "needs_review", "recovered_data")
      end
      return decision(summary, "technical", "system_events_only") if (@types.keys - [ "system_event" ]).empty?
      return decision(summary, "needs_review", "no_reliable_gps") if @gps.empty?

      points = @gps.sort_by { |point| point[:time] }
      # A median of the first five seconds resists a single initial GPS outlier.
      # It remains local in time, so a round trip cannot hide displacement.
      origin = points.first.dup
      initial_points = points.take_while { |point| point[:time] <= points.first[:time] + 5 }
      %i[lat lon altitude accuracy vertical_accuracy].each do |key|
        origin[key] = percentile(initial_points.map { |point| point[key] }, 0.5)
      end
      gaps = points.each_cons(2).map { |a, b| b[:time] - a[:time] }
      initial_gap = origin[:time] - @min_us / 1_000_000.0
      startup_acquisition = @min_us <= 5_000_000 && initial_gap <= STARTUP_GPS_GRACE_SECONDS
      gaps << initial_gap unless startup_acquisition
      gaps << @max_us / 1_000_000.0 - points.last[:time]
      summary["initial_gps_gap_seconds"] = initial_gap
      motion_start = nil
      previous = nil
      movement = false
      uncertain_motion = false
      upper_speeds = []
      radii = []
      points.each do |point|
        radius = distance(origin, point)
        radii << radius
        speed = Math.sqrt(point[:north]**2 + point[:east]**2)
        lower_speed = [ speed - point[:speed_accuracy], 0 ].max
        upper_speeds << speed + point[:speed_accuracy]
        horizontal_limit = [ 10.0, 3 * (origin[:accuracy] + point[:accuracy]) ].max
        vertical_limit = [ 10.0, 3 * (origin[:vertical_accuracy] + point[:vertical_accuracy]) ].max
        displaced = radius > horizontal_limit || (point[:altitude] - origin[:altitude]).abs > vertical_limit
        moving = lower_speed >= 1.0 || point[:down].abs - point[:speed_accuracy] >= 1.0 || displaced
        uncertain_motion ||= lower_speed > 0.3 || point[:down].abs - point[:speed_accuracy] > 0.3 || displaced
        if moving
          motion_start = point[:time] if !motion_start || !previous || point[:time] - previous[:time] > MAX_GPS_GAP_SECONDS
          movement ||= point[:time] - motion_start >= MOVEMENT_SECONDS
        else
          motion_start = nil
        end
        previous = point
      end
      summary.merge!("max_gps_gap_seconds" => gaps.max, "speed_upper_p95_mps" => percentile(upper_speeds, 0.95),
        "radius_p95_m" => percentile(radii, 0.95), "max_radius_m" => radii.max)
      return decision(summary, "moving", "sustained_movement") if movement
      return decision(summary, "needs_review", "operator_marker") if @types["marker"].positive?
      return decision(summary, "needs_review", "unsupported_records") if @types.keys.any? { |type| type.start_with?("unknown_") }
      return decision(summary, "needs_review", "short_recording") if points.last[:time] - points.first[:time] < MIN_STATIONARY_SECONDS
      if @gps.size < 10 || @gps.size.to_f / @gps_count < 0.9 || gaps.max > MAX_GPS_GAP_SECONDS
        return decision(summary, "needs_review", "incomplete_gps_coverage")
      end
      if uncertain_motion || summary["speed_upper_p95_mps"] > 0.5
        return decision(summary, "needs_review", "ambiguous_movement")
      end

      decision(summary, "stationary", "stationary_with_reliable_gps")
    end

    private

    def decision(summary, classification, reason)
      summary.merge("classification" => classification, "reason" => reason)
    end

    def gps_point(record, timestamp)
      return unless [ 3, 4 ].include?(record["fix_type"]) && record["gps_flags"].to_i.anybits?(1)

      fields = { lat: "latitude_deg_e7", lon: "longitude_deg_e7", altitude: "height_msl_mm",
        accuracy: "horizontal_accuracy_mm", vertical_accuracy: "vertical_accuracy_mm", speed_accuracy: "speed_accuracy_mm_s",
        north: "velocity_north_mm_s", east: "velocity_east_mm_s", down: "velocity_down_mm_s" }
      point = fields.transform_values { |key| Float(record[key], exception: false) }
      return unless point.values.all? { |value| value&.finite? }

      point.transform_values! { |value| value / 1_000.0 }
      point[:lat] /= 10_000.0
      point[:lon] /= 10_000.0
      return unless point[:lat].between?(-90, 90) && point[:lon].between?(-180, 180)
      return unless point[:accuracy].positive? && point[:accuracy] <= 10 && point[:vertical_accuracy].positive? && point[:vertical_accuracy] <= 20
      return unless point[:speed_accuracy].between?(0, 1)

      point.merge(time: timestamp / 1_000_000.0)
    end

    def distance(a, b)
      radians = Math::PI / 180
      latitude = (b[:lat] - a[:lat]) * radians
      longitude = (b[:lon] - a[:lon]) * radians
      h = Math.sin(latitude / 2)**2 + Math.cos(a[:lat] * radians) * Math.cos(b[:lat] * radians) * Math.sin(longitude / 2)**2
      2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h.clamp(0, 1)))
    end

    def percentile(values, fraction)
      values.sort.fetch(((values.size - 1) * fraction).ceil)
    end
  end
end
