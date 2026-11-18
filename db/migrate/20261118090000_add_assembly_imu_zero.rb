class AddAssemblyImuZero < ActiveRecord::Migration[8.0]
  def change
    add_column :assemblies, :imu_zero_history, :jsonb, null: false, default: []
  end
end
