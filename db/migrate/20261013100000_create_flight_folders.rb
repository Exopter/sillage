class CreateFlightFolders < ActiveRecord::Migration[8.1]
  def change
    create_table :flight_folders do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false, limit: 100
      t.timestamps
    end
    add_index :flight_folders, "user_id, lower(name)", unique: true, name: "index_flight_folders_on_owner_and_name"
    add_reference :flights, :folder, foreign_key: { to_table: :flight_folders, on_delete: :nullify }
  end
end
