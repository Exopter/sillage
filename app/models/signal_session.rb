class SignalSession < ApplicationRecord
  STATUSES = %w[live syncing completed failed].freeze

  belongs_to :flight
  belongs_to :user
  has_many :signal_batches, dependent: :delete_all
  has_many :operator_events, dependent: :delete_all
  has_one_attached :raw_capture

  before_validation :assign_defaults, on: :create

  validates :uuid, :started_at, presence: true
  validates :uuid, uniqueness: true
  validates :status, inclusion: { in: STATUSES }

  scope :recent, -> { order(started_at: :desc) }

  def acknowledge!(sequence)
    return if sequence.to_i <= last_acknowledged_sequence

    update!(last_acknowledged_sequence: sequence)
  end

  def complete!(ended_at: Time.current)
    transaction do
      update!(status: "completed", ended_at:)
      flight.update!(status: "processing", ended_at: flight.ended_at || ended_at)
    end
  end

  private

  def assign_defaults
    self.uuid ||= SecureRandom.uuid
    self.started_at ||= Time.current
  end
end
