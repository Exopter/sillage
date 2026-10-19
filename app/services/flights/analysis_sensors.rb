module Flights
  # Prove that GPS is sufficient before loading full-resolution pressure data.
  # The SQL extrema are conservative bounds: ambiguous values always fall back
  # to the existing pressure analysis, including its timestamp deduplication.
  class AnalysisSensors
    include Enumerable

    def initialize(flight)
      @flight = flight
    end

    def for_track(points, origin_time:)
      gps_max = points.filter_map { |point| point[:altitude_m] }.max
      return self unless gps_max

      max_altitude, min_pressure, ambiguous = @flight.sensor_samples.where(sensor_type: "BARO").pick(Arel.sql(<<~SQL.squish))
        MAX(CASE WHEN json_typeof(readings -> 'pressure_altitude_m') = 'number'
          THEN (readings ->> 'pressure_altitude_m')::numeric END),
        MIN(CASE WHEN json_typeof(readings -> 'pressure') = 'number'
          THEN CASE WHEN (readings ->> 'pressure')::numeric > 0 THEN (readings ->> 'pressure')::numeric END END),
        BOOL_OR(COALESCE(json_typeof(readings -> 'pressure_altitude_m'), 'null') NOT IN ('number', 'null')
          OR COALESCE(json_typeof(readings -> 'pressure'), 'null') NOT IN ('number', 'null'))
      SQL
      return self if ambiguous

      upper_bound = [ max_altitude&.to_f, PressureAltitude.from_pascals(min_pressure) ].compact.max
      return self if upper_bound && (!upper_bound.finite? || upper_bound >= gps_max + FlightAnalysis::SENSOR_ALTITUDE_DOMINANCE_M - 0.000001)

      timeline_samples(origin_time || inferred_origin(points))
    end

    def each
      return enum_for(:each) unless block_given?

      @flight.sensor_samples.where(sensor_type: "BARO").ordered
        .pluck(:recorded_at, :elapsed_seconds, Arel.sql("readings -> 'pressure_altitude_m'"), Arel.sql("readings -> 'pressure'"))
        .each do |recorded_at, elapsed_seconds, altitude, pressure|
          yield({ sensor_type: "BARO", recorded_at:, elapsed_seconds:,
            readings: { "pressure_altitude_m" => altitude, "pressure" => pressure } })
        end
      scope = @flight.sensor_samples.ordered
      [ scope.pick(:recorded_at, :elapsed_seconds), scope.reverse_order.pick(:recorded_at, :elapsed_seconds) ].compact.each do |recorded_at, elapsed_seconds|
        yield({ sensor_type: "TIMELINE", recorded_at:, elapsed_seconds: })
      end
    end

    private

    def inferred_origin(points)
      first = points.first
      first[:recorded_at] && first[:recorded_at] - first[:elapsed_seconds].to_f
    end

    def timeline_samples(origin)
      scope = @flight.sensor_samples
      timestamps = scope.pick(Arel.sql("MIN(recorded_at)"), Arel.sql("MAX(recorded_at)"))
      elapsed_scope = origin ? scope.where(recorded_at: nil) : scope
      elapsed = elapsed_scope.pick(Arel.sql("MIN(elapsed_seconds)"), Arel.sql("MAX(elapsed_seconds)"))
      timestamps.compact.map { |recorded_at| { sensor_type: "TIMELINE", recorded_at: } } +
        elapsed.compact.map { |elapsed_seconds| { sensor_type: "TIMELINE", elapsed_seconds: } }
    end
  end
end
