class AddWingSettingsToUsers < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :weight_kg, :decimal, precision: 4, scale: 1
    add_column :users, :height_cm, :integer
    add_column :users, :cg_setting, :decimal, precision: 3, scale: 1
    add_column :users, :tunnel_glide_ratio, :decimal, precision: 3, scale: 2
    add_column :users, :tunnel_speed_kmh, :integer
    add_column :users, :wing_settings_updated_at, :datetime
  end
end
