module Flights
  class RoutePreview
    # One bounded payload for the selected flight; no telemetry is loaded for
    # off-screen entries. Preserve the endpoints of the recorded trajectory.
    def self.call(flight)
      return [] unless flight.is_a?(Flight)

      sql = ApplicationRecord.sanitize_sql_array([ <<~SQL, flight.id ])
        SELECT lat, lon FROM (
          SELECT lat, lon, ROW_NUMBER() OVER (ORDER BY elapsed_seconds, recorded_at, id) AS n,
            COUNT(*) OVER () AS total
          FROM track_points WHERE flight_id = ?
            AND lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180
        ) points
        WHERE MOD(n - 1, GREATEST(CEIL(total / 399.0)::bigint, 1)) = 0 OR n = total
        ORDER BY n
      SQL
      ApplicationRecord.connection.select_rows(sql).map { |lat, lon| [ lat.to_f, lon.to_f ] }
    end
  end
end
