class AddAssemblyImuMount < ActiveRecord::Migration[8.0]
  def change
    add_column :assemblies, :imu_mount_profile, :string, null: false, default: "sensor_native"
    add_column :assemblies, :imu_mount_history, :jsonb, null: false, default: []
  end
end
