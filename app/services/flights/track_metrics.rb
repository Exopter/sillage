module Flights
  class TrackMetrics
    EARTH_RADIUS_M = 6_371_000.0

    def initialize(points)
      @points = if points.all? { |point| point[:elapsed_seconds] }
        SampleOrder.sort(points) { |point| point[:elapsed_seconds] }
      else
        SampleOrder.sort(points) { |point| point[:recorded_at] || Time.at(0) }
      end
    end

    def prepared_points
      return [] if @points.empty?

      origin_time = @points.first[:recorded_at]
      previous = nil
      distance = 0.0

      @points.map do |point|
        distance += haversine_distance(previous, point) if previous
        previous = point

        horizontal_speed = speed(point[:vel_n_mps], point[:vel_e_mps])
        vertical_speed = point[:vel_d_mps]&.to_f

        point.merge(
          elapsed_seconds: point[:elapsed_seconds] || (point[:recorded_at] && origin_time ? point[:recorded_at] - origin_time : nil),
          horizontal_speed_mps: horizontal_speed,
          vertical_speed_mps: vertical_speed,
          glide_ratio: glide_ratio(horizontal_speed, vertical_speed),
          distance_from_start_m: distance
        )
      end
    end

    def summary(points = prepared_points, sensor_count: 0, bounds: nil)
      minimum = maximum = max_horizontal = max_vertical = nil
      glide_sum = 0.0
      glide_count = 0
      points.each do |point|
        altitude = point[:altitude_m]&.to_f
        horizontal = point[:horizontal_speed_mps]&.to_f
        vertical = point[:vertical_speed_mps]&.to_f
        minimum = altitude if altitude && (!minimum || altitude < minimum)
        maximum = altitude if altitude && (!maximum || altitude > maximum)
        max_horizontal = horizontal if horizontal && (!max_horizontal || horizontal > max_horizontal)
        max_vertical = vertical if vertical && (!max_vertical || vertical > max_vertical)
        glide = point[:glide_ratio]&.to_f
        if glide&.finite? && within_glide_bounds?(point, bounds)
          glide_sum += glide
          glide_count += 1
        end
      end

      {
        started_at: points.first&.fetch(:recorded_at, nil),
        ended_at: points.last&.fetch(:recorded_at, nil),
        duration_seconds: duration(points),
        min_altitude_m: minimum,
        max_altitude_m: maximum,
        altitude_loss_m: minimum && maximum ? maximum - minimum : nil,
        distance_m: points.last&.fetch(:distance_from_start_m, nil),
        max_horizontal_speed_mps: max_horizontal,
        max_vertical_speed_mps: max_vertical,
        avg_glide_ratio: glide_count.positive? ? glide_sum / glide_count : nil,
        sample_count: points.size,
        sensor_sample_count: sensor_count
      }
    end

    private

    def within_glide_bounds?(point, bounds)
      return true unless bounds && (bounds[:exit_at] || bounds[:opening_at])

      recorded_at = point[:recorded_at]
      recorded_at && (!bounds[:exit_at] || recorded_at >= bounds[:exit_at]) &&
        (!bounds[:opening_at] || recorded_at <= bounds[:opening_at])
    end

    def duration(points)
      return nil if points.size < 2

      first = points.first[:elapsed_seconds]
      last = points.last[:elapsed_seconds]
      last - first if first && last
    end

    def speed(north, east)
      return nil unless north && east

      Math.sqrt(north.to_f**2 + east.to_f**2)
    end

    def glide_ratio(horizontal_speed, vertical_speed)
      return nil unless horizontal_speed && vertical_speed&.positive?
      return nil if vertical_speed < 0.3

      horizontal_speed / vertical_speed
    end

    def haversine_distance(a, b)
      return 0.0 unless coordinate?(a) && coordinate?(b)

      lat1 = radians(a[:lat])
      lat2 = radians(b[:lat])
      delta_lat = radians(b[:lat] - a[:lat])
      delta_lon = radians(b[:lon] - a[:lon])
      h = Math.sin(delta_lat / 2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(delta_lon / 2)**2

      2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
    end

    def coordinate?(point)
      point && point[:lat].present? && point[:lon].present?
    end

    def radians(degrees)
      degrees.to_f * Math::PI / 180.0
    end
  end
end
