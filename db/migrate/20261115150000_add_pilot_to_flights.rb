class AddPilotToFlights < ActiveRecord::Migration[8.1]
  def up
    add_reference :flights, :pilot, foreign_key: { to_table: :users }
    execute "UPDATE flights SET pilot_id = user_id"
    change_column_null :flights, :pilot_id, false
  end

  def down
    remove_reference :flights, :pilot, foreign_key: { to_table: :users }
  end
end
