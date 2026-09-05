class SeedFlightAndBuildIdentifiers < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      INSERT INTO identifier_sequences (name, last_value, created_at, updated_at)
      SELECT 'flight_code/' || match[1], MAX(match[2]::bigint), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM (SELECT regexp_match(code, '^FLT-([0-9]{4})-([0-9]+)$') AS match FROM flights) codes
      WHERE match IS NOT NULL
      GROUP BY match[1]
      ON CONFLICT (name) DO UPDATE
      SET last_value = GREATEST(identifier_sequences.last_value, EXCLUDED.last_value)
    SQL
    execute <<~SQL
      INSERT INTO identifier_sequences (name, last_value, created_at, updated_at)
      SELECT 'build_code', COALESCE(MAX(substring(code FROM '^FDR-DEV-([0-9]+)$')::bigint), 0),
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM builds
      ON CONFLICT (name) DO UPDATE
      SET last_value = GREATEST(identifier_sequences.last_value, EXCLUDED.last_value)
    SQL
  end

  def down
    # Keep reservations so a rollback cannot reuse already issued identifiers.
  end
end
