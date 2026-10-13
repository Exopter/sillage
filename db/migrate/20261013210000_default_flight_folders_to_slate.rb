class DefaultFlightFoldersToSlate < ActiveRecord::Migration[8.1]
  def up
    change_column_default :flight_folders, :color, from: "field", to: "graphite"
    execute "UPDATE flight_folders SET color = 'graphite'"
  end

  def down
    change_column_default :flight_folders, :color, from: "graphite", to: "field"
  end
end
