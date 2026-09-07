class FdrFunctionalConfiguration < ApplicationRecord
  has_many :assemblies, dependent: :restrict_with_error

  normalizes :planned_capabilities, with: ->(value) { value.to_s.strip.presence }
  validates :version, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than: 2**31 }, uniqueness: true
  validates :planned_capabilities, presence: true
  validate :used_configuration_is_immutable, on: :update
  before_update :lock_and_check_usage

  scope :ordered, -> { order(:version) }

  def label
    "V#{version}"
  end

  def snapshot
    { "version" => version, "planned_capabilities" => planned_capabilities }
  end

  private

  def lock_and_check_usage
    self.class.where(id: id).lock.pick(:id)
    used_configuration_is_immutable
    throw(:abort) if errors.any?
  end

  def used_configuration_is_immutable
    return unless (will_save_change_to_version? || will_save_change_to_planned_capabilities?) && assemblies.exists?

    errors.add(:base, "A configuration used by an assembly is fixed. Create a new version for different capabilities.")
  end
end
