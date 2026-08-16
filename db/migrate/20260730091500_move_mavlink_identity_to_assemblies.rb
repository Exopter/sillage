class MoveMavlinkIdentityToAssemblies < ActiveRecord::Migration[8.1]
  def up
    add_column :assemblies, :mavlink_system_id, :integer
    add_column :assemblies, :mavlink_component_id, :integer
    add_column :signal_sessions, :mavlink_system_id, :integer
    add_column :signal_sessions, :mavlink_component_id, :integer

    execute <<~SQL
      UPDATE assemblies
      SET mavlink_system_id = (
        SELECT CAST(aircraft.telemetry_system_id AS INTEGER)
        FROM installations
        INNER JOIN aircraft ON aircraft.id = installations.aircraft_id
        WHERE installations.installable_type = 'Assembly'
          AND installations.installable_id = assemblies.id
          AND installations.removed_at IS NULL
        LIMIT 1
      )
      WHERE assemblies.id IN (
        SELECT installations.installable_id
        FROM installations
        INNER JOIN aircraft ON aircraft.id = installations.aircraft_id
        WHERE installations.installable_type = 'Assembly'
          AND installations.removed_at IS NULL
          AND aircraft.telemetry_system_id GLOB '[0-9]*'
          AND aircraft.telemetry_system_id NOT GLOB '*[^0-9]*'
          AND CAST(aircraft.telemetry_system_id AS INTEGER) BETWEEN 1 AND 255
          AND (
            SELECT COUNT(*)
            FROM installations AS sibling_installations
            WHERE sibling_installations.aircraft_id = installations.aircraft_id
              AND sibling_installations.installable_type = 'Assembly'
              AND sibling_installations.removed_at IS NULL
          ) = 1
      )
    SQL

    execute <<~SQL
      UPDATE signal_sessions
      SET mavlink_system_id = CAST(json_extract(station_metadata, '$.telemetry_system_id') AS INTEGER)
      WHERE json_valid(station_metadata)
        AND json_extract(station_metadata, '$.telemetry_system_id') IS NOT NULL
        AND CAST(json_extract(station_metadata, '$.telemetry_system_id') AS INTEGER) BETWEEN 1 AND 255
    SQL

    remove_index :aircraft, name: "index_aircraft_on_telemetry_system_id"
    remove_column :aircraft, :telemetry_system_id
  end

  def down
    add_column :aircraft, :telemetry_system_id, :string

    execute <<~SQL
      UPDATE aircraft
      SET telemetry_system_id = CAST((
        SELECT assemblies.mavlink_system_id
        FROM installations
        INNER JOIN assemblies ON assemblies.id = installations.installable_id
        WHERE installations.aircraft_id = aircraft.id
          AND installations.installable_type = 'Assembly'
          AND installations.removed_at IS NULL
          AND assemblies.mavlink_system_id IS NOT NULL
        LIMIT 1
      ) AS TEXT)
      WHERE (
        SELECT COUNT(*)
        FROM installations
        INNER JOIN assemblies ON assemblies.id = installations.installable_id
        WHERE installations.aircraft_id = aircraft.id
          AND installations.installable_type = 'Assembly'
          AND installations.removed_at IS NULL
          AND assemblies.mavlink_system_id IS NOT NULL
      ) = 1
        AND (
          SELECT COUNT(DISTINCT duplicate_installations.aircraft_id)
          FROM installations AS duplicate_installations
          INNER JOIN assemblies AS duplicate_assemblies
            ON duplicate_assemblies.id = duplicate_installations.installable_id
          WHERE duplicate_installations.installable_type = 'Assembly'
            AND duplicate_installations.removed_at IS NULL
            AND duplicate_assemblies.mavlink_system_id = (
              SELECT assemblies.mavlink_system_id
              FROM installations
              INNER JOIN assemblies ON assemblies.id = installations.installable_id
              WHERE installations.aircraft_id = aircraft.id
                AND installations.installable_type = 'Assembly'
                AND installations.removed_at IS NULL
                AND assemblies.mavlink_system_id IS NOT NULL
              LIMIT 1
            )
        ) = 1
    SQL

    add_index :aircraft, :telemetry_system_id, unique: true,
      where: "telemetry_system_id IS NOT NULL AND telemetry_system_id != ''"
    remove_column :signal_sessions, :mavlink_component_id
    remove_column :signal_sessions, :mavlink_system_id
    remove_column :assemblies, :mavlink_component_id
    remove_column :assemblies, :mavlink_system_id
  end
end
