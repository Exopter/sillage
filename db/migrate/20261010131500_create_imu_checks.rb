class CreateImuChecks < ActiveRecord::Migration[8.0]
  def change
    create_table :imu_checks do |t|
      t.references :embedded_controller, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.references :flight, foreign_key: true
      t.references :calibration, foreign_key: { to_table: :imu_checks }
      t.string :uuid, null: false
      t.string :kind, null: false
      t.string :outcome, null: false
      t.string :firmware, null: false
      t.string :configuration_digest, null: false
      t.bigint :boot_id, null: false
      t.bigint :imu_epoch, null: false
      t.jsonb :evidence, null: false, default: {}
      t.jsonb :summary, null: false, default: {}
      t.timestamps
    end
    add_index :imu_checks, :uuid, unique: true
  end
end
