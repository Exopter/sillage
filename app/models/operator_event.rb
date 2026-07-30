class OperatorEvent < ApplicationRecord
  EVENT_TYPES = %w[marker note warning].freeze

  belongs_to :signal_session
  belongs_to :flight

  before_validation :assign_defaults, on: :create

  validates :uuid, :occurred_at, presence: true
  validates :uuid, uniqueness: true
  validates :event_type, inclusion: { in: EVENT_TYPES }

  private

  def assign_defaults
    self.uuid ||= SecureRandom.uuid
    self.occurred_at ||= Time.current
  end
end
