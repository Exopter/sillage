class CreateFlightComments < ActiveRecord::Migration[8.1]
  def change
    create_table :flight_comments do |t|
      t.references :flight, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.text :body, null: false
      t.boolean :imported_from_notes, null: false, default: false
      t.datetime :edited_at
      t.timestamps
    end
    add_index :flight_comments, [ :flight_id, :created_at, :id ]
    add_index :flight_comments, :flight_id, unique: true, where: "imported_from_notes", name: "index_flight_comments_on_imported_note"
    add_check_constraint :flight_comments, "length(body) > 0", name: "flight_comments_body_present"
  end
end
