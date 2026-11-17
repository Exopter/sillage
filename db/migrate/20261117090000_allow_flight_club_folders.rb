class AllowFlightClubFolders < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :flight_folders, name: "flight_folder_visibility"
    add_check_constraint :flight_folders, "visibility IN ('private', 'public', 'shared', 'club')", name: "flight_folder_visibility"
  end

  def down
    remove_check_constraint :flight_folders, name: "flight_folder_visibility"
    add_check_constraint :flight_folders, "visibility IN ('private', 'public', 'shared')", name: "flight_folder_visibility"
  end
end
