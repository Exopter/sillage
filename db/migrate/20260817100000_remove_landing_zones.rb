class RemoveLandingZones < ActiveRecord::Migration[8.1]
  def up
    remove_reference :flight_imports, :landing_zone, foreign_key: true if column_exists?(:flight_imports, :landing_zone_id)
    remove_reference :flights, :landing_zone, foreign_key: true if column_exists?(:flights, :landing_zone_id)
    drop_table :landing_zones if table_exists?(:landing_zones)
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Landing zones were removed from the product model."
  end
end
