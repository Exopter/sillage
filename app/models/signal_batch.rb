class SignalBatch < ApplicationRecord
  belongs_to :signal_session

  validates :sequence, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :sequence, uniqueness: { scope: :signal_session_id }

  scope :ordered, -> { order(:sequence) }
end
