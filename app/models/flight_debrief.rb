class FlightDebrief < ApplicationRecord
  belongs_to :flight
  belongs_to :user
  belongs_to :flight_comment, optional: true
  has_one_attached :audio
  validates :uuid, presence: true, uniqueness: true
  validates :status, inclusion: { in: %w[recording uploaded processing ready failed published] }
  validates :summary, length: { maximum: 4_000 }
  validates :transcript, length: { maximum: 200_000 }
end
