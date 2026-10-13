class AddColorToFlightFolders < ActiveRecord::Migration[8.1]
  def change
    add_column :flight_folders, :color, :string, null: false, default: "field"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          UPDATE flight_folders
          SET color = CASE (id % 3) WHEN 1 THEN 'sky' WHEN 2 THEN 'amber' ELSE 'field' END
        SQL
      end
    end
    add_check_constraint :flight_folders, "color IN ('field', 'sky', 'aqua', 'amber', 'violet', 'graphite')", name: "flight_folder_color"
  end
end
