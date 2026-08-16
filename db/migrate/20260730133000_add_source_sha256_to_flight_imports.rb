class AddSourceSha256ToFlightImports < ActiveRecord::Migration[8.1]
  def change
    add_column :flight_imports, :source_sha256, :string
    add_index :flight_imports,
      %i[user_id source_sha256],
      unique: true,
      where: "source_sha256 IS NOT NULL",
      name: "index_flight_imports_on_user_and_source_sha256"
  end
end
