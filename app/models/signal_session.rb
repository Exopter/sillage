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
  validates :mavlink_system_id, :mavlink_component_id,
    inclusion: { in: 1..255 }, allow_nil: true

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

  def observe_mavlink_identity!(system_id:, component_id: nil)
    metadata = station_metadata.deep_dup
    observed_system_ids = Array(metadata["observed_mavlink_system_ids"])
    observed_component_ids = Array(metadata["observed_mavlink_component_ids"])
    metadata["observed_mavlink_system_ids"] = (observed_system_ids + [ system_id ]).compact.uniq
    metadata["observed_mavlink_component_ids"] = (observed_component_ids + [ component_id ]).compact.uniq

    attributes = { station_metadata: metadata }
    attributes[:mavlink_system_id] = system_id if mavlink_system_id.nil?
    attributes[:mavlink_component_id] = component_id if mavlink_component_id.nil? && component_id
    attributes.delete(:station_metadata) if metadata == station_metadata
    update!(attributes) if attributes.any?
  end

  private

  def assign_defaults
    self.uuid ||= SecureRandom.uuid
    self.started_at ||= Time.current
  end
end
