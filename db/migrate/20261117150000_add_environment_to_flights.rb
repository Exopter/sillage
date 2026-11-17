# A flight is flown in the wind tunnel or in the sky. Signal and the flight
# screens present each one differently.
class AddEnvironmentToFlights < ActiveRecord::Migration[8.1]
  def up
    add_column :flights, :environment, :string, null: false, default: "sky"
    add_column :flights, :tunnel_glide_ratio, :decimal, precision: 4, scale: 2
    add_check_constraint :flights, "environment IN ('sky', 'tunnel')", name: "flights_environment_check"
    add_index :flights, :environment
    add_column :signal_stations, :environment, :string, null: false, default: "sky"
    add_column :signal_stations, :tunnel_glide_ratio, :decimal, precision: 4, scale: 2
    add_check_constraint :signal_stations, "environment IN ('sky', 'tunnel')", name: "signal_stations_environment_check"
    # Every flight started from the phone remote so far was a tunnel flight.
    execute "UPDATE flights SET environment = 'tunnel' WHERE remote_start_requested_at IS NOT NULL"
    # A tunnel flight is at Inclined Slovenia unless another place was entered.
    execute "UPDATE flights SET location = 'Inclined Slovenia', location_source = 'manual' WHERE environment = 'tunnel' AND (location IS NULL OR btrim(location) = '')"
  end

  def down
    remove_check_constraint :signal_stations, name: "signal_stations_environment_check"
    remove_column :signal_stations, :tunnel_glide_ratio
    remove_column :signal_stations, :environment
    remove_index :flights, :environment
    remove_check_constraint :flights, name: "flights_environment_check"
    remove_column :flights, :tunnel_glide_ratio
    remove_column :flights, :environment
  end
end
