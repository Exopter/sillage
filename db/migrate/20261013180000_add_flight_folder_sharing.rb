class AddFlightFolderSharing < ActiveRecord::Migration[8.1]
  def change
    add_column :flight_folders, :visibility, :string, null: false, default: "private"
    add_check_constraint :flight_folders, "visibility IN ('private', 'public', 'shared')", name: "flight_folder_visibility"
    add_index :flight_folders, :visibility
    create_table :flight_folder_memberships do |t|
      t.references :flight_folder, null: false, foreign_key: { on_delete: :cascade }
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
    end
    add_index :flight_folder_memberships, [ :flight_folder_id, :user_id ], unique: true, name: "index_folder_memberships_on_folder_and_user"
  end
end
