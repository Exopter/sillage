require "csv"

module Flights
  class RawDataCsv
    GPS = %w[lat lon altitude_m vel_n_mps vel_e_mps vel_d_mps gps_fix satellite_count horizontal_accuracy_m
      vertical_accuracy_m speed_accuracy_mps heading_deg course_accuracy_deg horizontal_speed_mps vertical_speed_mps
      glide_ratio distance_from_start_m].freeze
    HEADER = %w[recorded_at_utc elapsed_seconds sensor_type fdr_timestamp_us fdr_sequence].freeze

    def initialize(flight)
      @flight = flight
    end

    def each
      ApplicationRecord.with_connection do |db|
        # Use one snapshot for the column list and the observations, even during an import.
        isolation = :repeatable_read unless db.transaction_open?
        db.transaction(isolation:, requires_new: true) do
          id = db.quote(@flight.id)
          keys = db.select_values(<<~SQL)
            SELECT DISTINCT jsonb_object_keys(readings::jsonb) AS key
            FROM sensor_samples WHERE flight_id = #{id} ORDER BY key
          SQL
          yield CSV.generate_line(HEADER + GPS + keys.map { |key| "reading.#{key}" })

          pg = db.raw_connection
          pg.exec("DECLARE raw_flight_rows NO SCROLL CURSOR FOR #{query(id)}")
          loop do
            batch = pg.exec("FETCH FORWARD 1024 FROM raw_flight_rows").values
            break if batch.empty?
            yield CSV.generate { |csv| batch.each { |row| csv << cells(row, keys) } }
          end
          pg.exec("CLOSE raw_flight_rows")
        end
      end
    end

    private

    def query(id)
      <<~SQL
        SELECT to_char(recorded_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), elapsed_seconds, sensor_type,
               fdr_timestamp_us, fdr_sequence, #{GPS.join(", ")}, readings
        FROM (
          SELECT id, recorded_at, elapsed_seconds, 'GPS' AS sensor_type, fdr_timestamp_us, fdr_sequence,
                 #{GPS.join(", ")}, NULL::text AS readings, 0 AS kind
          FROM track_points WHERE flight_id = #{id}
          UNION ALL
          SELECT id, recorded_at, elapsed_seconds, sensor_type, fdr_timestamp_us, fdr_sequence,
                 #{GPS.map { "NULL" }.join(", ")}, readings::text, 1 AS kind
          FROM sensor_samples WHERE flight_id = #{id}
        ) AS samples
        ORDER BY elapsed_seconds NULLS LAST, recorded_at NULLS LAST, kind, id
      SQL
    end

    def cells(row, keys)
      payload = row.pop
      readings = payload ? JSON.parse(payload) : {}
      row[2] = csv_value(row[2])
      row + keys.map { |key| csv_value(readings[key]) }
    end

    def csv_value(value)
      case value
      when Hash, Array then JSON.generate(value)
      when String then value.match?(/\A(?:[\t\r\n]|\s*[=+@-])/) ? "'#{value}" : value
      else value
      end
    end
  end
end
