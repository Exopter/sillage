class AddVisibilityToFlights < ActiveRecord::Migration[8.1]
  def change
    add_column :flights, :visibility, :string, null: false, default: "private"
    add_check_constraint :flights, "visibility IN ('private', 'team')", name: "flights_visibility_check"
    add_index :flights, :visibility, where: "visibility = 'team'", name: "index_flights_on_team_visibility"
  end
end
