class AddFlightLogFields < ActiveRecord::Migration[8.1]
  def change
    add_column :flights, :flown_on, :date
    add_column :flights, :flown_at, :time
    add_reference :flights, :fdr, foreign_key: { to_table: :assemblies }
    add_index :flights, :flown_on
  end
end
