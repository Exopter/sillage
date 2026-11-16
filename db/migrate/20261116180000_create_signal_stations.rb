class CreateSignalStations < ActiveRecord::Migration[8.1]
  def change
    # One row per ground computer showing Signal in standby: what it hears and
    # whether it follows the phone remote.
    create_table :signal_stations do |t|
      t.references :user, null: false, foreign_key: true
      t.string :key, null: false
      t.boolean :remote_enabled, null: false, default: false
      t.boolean :ready, null: false, default: false
      t.string :device_id
      t.string :aircraft_label
      t.datetime :seen_at, null: false
      t.timestamps
    end
    add_index :signal_stations, :key, unique: true
    add_index :signal_stations, :seen_at
  end
end
