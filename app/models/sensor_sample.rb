class SensorSample < ApplicationRecord
  belongs_to :flight, inverse_of: :sensor_samples

  scope :ordered, -> { order(:elapsed_seconds, :recorded_at) }

  def installed_readings
    Imu::Mount.readings(sensor_type, readings || {})
  end
end
