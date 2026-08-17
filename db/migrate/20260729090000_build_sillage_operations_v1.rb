class BuildSillageOperationsV1 < ActiveRecord::Migration[8.1]
  def up
    create_table :aircraft do |t|
      t.string :registration, null: false
      t.string :name, null: false
      t.string :telemetry_system_id
      t.text :notes
      t.boolean :active, null: false, default: true
      t.timestamps
    end
    add_index :aircraft, :registration, unique: true
    add_index :aircraft, :telemetry_system_id, unique: true, where: "telemetry_system_id IS NOT NULL AND telemetry_system_id != ''"

    rename_table :jumps, :flights
    rename_column :track_points, :jump_id, :flight_id
    rename_column :sensor_samples, :jump_id, :flight_id

    add_reference :flights, :user, foreign_key: true
    execute <<~SQL
      UPDATE flights
      SET user_id = (
        SELECT flight_imports.user_id
        FROM flight_imports
        WHERE flight_imports.id = flights.flight_import_id
      )
    SQL
    change_column_null :flights, :user_id, false
    change_column_null :flights, :flight_import_id, true
    add_reference :flights, :aircraft, foreign_key: true
    add_column :flights, :code, :string
    add_column :flights, :status, :string, null: false, default: "analysed"
    add_column :flights, :configuration_snapshot, :json, null: false, default: {}
    add_index :flights, :code, unique: true
    add_index :flights, :status

    select_rows("SELECT id, COALESCE(started_at, created_at) FROM flights ORDER BY id").each do |id, timestamp|
      year = Time.zone.parse(timestamp.to_s).year
      execute "UPDATE flights SET code = #{connection.quote(format('FLT-%04d-%03d', year, id))} WHERE id = #{Integer(id)}"
    end
    change_column_null :flights, :code, false
    change_column_default :flights, :status, from: "analysed", to: "preparation"

    add_reference :flight_imports, :aircraft, foreign_key: true
    add_reference :flight_imports, :target_flight, foreign_key: { to_table: :flights }
    add_column :flight_imports, :import_type, :string, null: false, default: "flysight"

    create_table :installations do |t|
      t.references :aircraft, null: false, foreign_key: true
      t.references :installable, polymorphic: true, null: false
      t.datetime :installed_at, null: false
      t.datetime :removed_at
      t.text :notes
      t.timestamps
    end
    add_index :installations, [ :installable_type, :installable_id ], unique: true,
      where: "removed_at IS NULL", name: "index_active_installation_per_asset"
    add_index :installations, [ :aircraft_id, :removed_at ]

    create_table :signal_sessions do |t|
      t.string :uuid, null: false
      t.references :flight, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :status, null: false, default: "live"
      t.datetime :started_at, null: false
      t.datetime :ended_at
      t.integer :last_acknowledged_sequence, null: false, default: -1
      t.json :station_metadata, null: false, default: {}
      t.timestamps
    end
    add_index :signal_sessions, :uuid, unique: true
    add_index :signal_sessions, :status

    create_table :signal_batches do |t|
      t.references :signal_session, null: false, foreign_key: true
      t.integer :sequence, null: false
      t.datetime :first_received_at
      t.datetime :last_received_at
      t.string :checksum
      t.json :payload, null: false, default: {}
      t.timestamps
    end
    add_index :signal_batches, [ :signal_session_id, :sequence ], unique: true

    create_table :operator_events do |t|
      t.references :signal_session, null: false, foreign_key: true
      t.references :flight, null: false, foreign_key: true
      t.string :uuid, null: false
      t.string :event_type, null: false, default: "marker"
      t.datetime :occurred_at, null: false
      t.string :label
      t.json :metadata, null: false, default: {}
      t.timestamps
    end
    add_index :operator_events, :uuid, unique: true

    execute "UPDATE active_storage_attachments SET record_type = 'Flight' WHERE record_type = 'Jump'"
  end

  def down
    execute "UPDATE active_storage_attachments SET record_type = 'Jump' WHERE record_type = 'Flight'"
    drop_table :operator_events
    drop_table :signal_batches
    drop_table :signal_sessions
    drop_table :installations
    remove_column :flight_imports, :import_type
    remove_reference :flight_imports, :target_flight, foreign_key: { to_table: :flights }
    remove_reference :flight_imports, :aircraft, foreign_key: true
    remove_index :flights, :status
    remove_index :flights, :code
    remove_column :flights, :configuration_snapshot
    remove_column :flights, :status
    remove_column :flights, :code
    remove_reference :flights, :aircraft, foreign_key: true
    remove_reference :flights, :user, foreign_key: true
    change_column_null :flights, :flight_import_id, false
    rename_column :sensor_samples, :flight_id, :jump_id
    rename_column :track_points, :flight_id, :jump_id
    rename_table :flights, :jumps
    drop_table :aircraft
  end
end
