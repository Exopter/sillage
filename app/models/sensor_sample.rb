class SensorSample < ApplicationRecord
  belongs_to :flight, inverse_of: :sensor_samples

  scope :ordered, -> { order(:elapsed_seconds, :recorded_at) }
end
