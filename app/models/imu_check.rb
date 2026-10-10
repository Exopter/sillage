class ImuCheck < ApplicationRecord
  belongs_to :embedded_controller
  belongs_to :user
  belongs_to :flight, optional: true
  belongs_to :calibration, class_name: "ImuCheck", optional: true

  validates :uuid, :firmware, :configuration_digest, presence: true
  validates :uuid, uniqueness: true
  validates :kind, inclusion: { in: %w[calibration preflight] }
  validates :outcome, inclusion: { in: %w[passed failed] }
  validates :boot_id, :imu_epoch, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than: 2**32 }
  scope :recent, -> { order(created_at: :desc, id: :desc) }

  def self.configuration_for(controller)
    { device_id: controller.device_id, part: controller.part_id, assembly: controller.assembly&.snapshot, aircraft: controller.aircraft&.id }
  end

  def self.configuration_digest_for(controller)
    Digest::SHA256.hexdigest(configuration_for(controller).to_json)
  end

  def current_configuration?
    configuration_digest == self.class.configuration_digest_for(embedded_controller)
  end

  def self.reference_for(controller, firmware:)
    reference = where(embedded_controller: controller, kind: "calibration", firmware:,
      configuration_digest: configuration_digest_for(controller)).recent.first
    reference if reference&.outcome == "passed" && reference.invalidated_at.nil? && reference.summary["limits_version"] == Imu::Assessment::LIMITS_VERSION
  end
end
