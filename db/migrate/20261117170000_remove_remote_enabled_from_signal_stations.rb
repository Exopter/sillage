# A station in standby follows the phone remote whenever it hears an aircraft:
# the switch that used to gate it is gone.
class RemoveRemoteEnabledFromSignalStations < ActiveRecord::Migration[8.1]
  def change
    remove_column :signal_stations, :remote_enabled, :boolean, default: false, null: false
  end
end
