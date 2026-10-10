class AddImuCheckInvalidation < ActiveRecord::Migration[8.0]
  def change
    add_column :imu_checks, :invalidated_at, :datetime
    add_column :imu_checks, :invalidation_reason, :string
  end
end
