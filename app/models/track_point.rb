class TrackPoint < ApplicationRecord
  belongs_to :flight, inverse_of: :track_points

  scope :ordered, -> { order(:elapsed_seconds, :recorded_at) }
end
