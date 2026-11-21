module Flights
  # Seconds from the first to the last pitot sample at flying pressure: the server-side twin of
  # flyingRange in tunnel_flight.js, so lists and the flight record give the same figure.
  # Nil without airspeed data: nothing else in a tunnel recording tells when the wing was flying.
  class TunnelFlyingDuration
    FLYING_PRESSURE_PA = 200.0
    AIR_DENSITY = 1.225
    DYNAMIC_PRESSURE_SQL = <<~SQL.squish.freeze
      COALESCE(
        NULLIF(readings->>'differential_pressure_pa', '')::double precision,
        0.5 * #{AIR_DENSITY} * power(NULLIF(readings->>'airspeed_m_s', '')::double precision, 2)
      )
    SQL

    def self.call(flight)
      self.for([ flight.id ])[flight.id]
    end

    # Flying seconds by flight id, in one query; flights without two flying samples are absent.
    def self.for(flight_ids)
      return {} if flight_ids.empty?

      SensorSample.where(flight_id: flight_ids, sensor_type: "AIRSPEED")
        .where("#{DYNAMIC_PRESSURE_SQL} >= ?", FLYING_PRESSURE_PA)
        .group(:flight_id)
        .pluck(:flight_id, Arel.sql("MIN(elapsed_seconds)"), Arel.sql("MAX(elapsed_seconds)"), Arel.sql("COUNT(*)"))
        .each_with_object({}) { |(id, first, last, count), durations| durations[id] = last - first if count >= 2 && first && last && last > first }
    end
  end
end
