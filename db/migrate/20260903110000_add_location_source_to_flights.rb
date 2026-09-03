class AddLocationSourceToFlights < ActiveRecord::Migration[8.1]
  def change
    add_column :flights, :location_source, :string
  end
end
