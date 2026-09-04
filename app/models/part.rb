class Part < ApplicationRecord
  include AssetIdentifiable

  STATES = %w[available installed quarantined retired].freeze
  EDITABLE_STATES = %w[available quarantined retired].freeze

  belongs_to :function
  has_many :part_installations, dependent: :restrict_with_error
  has_one :active_part_installation, -> { active }, class_name: "PartInstallation"
  has_one :assembly, through: :active_part_installation
  has_one :embedded_controller, dependent: :restrict_with_error, inverse_of: :part
  has_many :test_runs, dependent: :restrict_with_error
  has_many :installations, as: :installable, dependent: :restrict_with_error

  before_validation :synchronize_installation_state

  normalizes :internal_number, with: ->(number) { number.to_s.strip.upcase.presence }
  normalizes :serial_number, with: ->(number) { number.to_s.strip.presence }

  validates :model, presence: true
  validates :internal_number, uniqueness: true, allow_nil: true
  validates :internal_number, format: { with: AssetIdentifier::PATTERN }, allow_nil: true
  validates :serial_number, uniqueness: { scope: :manufacturer }, allow_blank: true
  validates :state, inclusion: { in: STATES }
  validate :non_serviceable_part_is_not_installed
  validate :assembly_does_not_conflict_with_aircraft_installation
  validate :embedded_controller_requires_controller_function

  scope :ordered, -> { order(:internal_number) }
  scope :available, -> { where(state: "available").where.missing(:active_part_installation) }

  def display_name
    [ manufacturer, model ].compact_blank.join(" ")
  end

  def snapshot
    {
      "internal_number" => internal_number,
      "function" => function.name,
      "function_code" => function.code,
      "manufacturer" => manufacturer,
      "model" => model,
      "serial_number" => serial_number,
      "embedded_controller" => embedded_controller&.snapshot
    }
  end

  def assembly_at(time)
    part_installations.covering(time).includes(:assembly).recent.first&.assembly
  end

  def install_in!(target_assembly, at: Time.current, notes: nil)
    transaction do
      lock!
      unless state == "available" && assembly.nil? && !installations.active.exists?
        errors.add(:base, "Part must be available and outside another assembly or aircraft")
        raise ActiveRecord::RecordInvalid, self
      end

      part_installations.create!(assembly: target_assembly, installed_at: at, notes:)
      reset_assembly_associations(target_assembly)
      update!(state: "installed")
    end
  end

  def remove_from_assembly!(at: Time.current)
    transaction do
      lock!
      current_installation = active_part_installation
      raise ActiveRecord::RecordNotFound, "Part is not installed in an assembly" unless current_installation

      current_installation.remove!(at:)
      reset_assembly_associations(current_installation.assembly)
      update!(state: installations.active.exists? ? "installed" : "available")
    end
  end

  def deletion_blockers
    [].tap do |blockers|
      blockers << "assembly installation history" if part_installations.exists?
      blockers << "test history" if test_runs.exists?
      blockers << "installation history" if installations.exists?
      blockers << "an embedded controller record" if embedded_controller.present?
    end
  end

  private

  def reset_assembly_associations(target_assembly)
    association(:active_part_installation).reset
    association(:assembly).reset
    target_assembly.association(:active_part_installations).reset
    target_assembly.association(:parts).reset
  end

  def synchronize_installation_state
    actively_installed = persisted? && installations.active.exists?
    if assembly.present? || actively_installed
      self.state = "installed" if state.in?(%w[available installed])
    elsif state == "installed"
      self.state = "available"
    end
  end

  def non_serviceable_part_is_not_installed
    return unless (assembly.present? || installations.active.exists?) && state.in?(%w[quarantined retired])

    errors.add(:state, "cannot be installed while #{state}")
  end

  def assembly_does_not_conflict_with_aircraft_installation
    return unless assembly.present? && installations.active.exists?

    errors.add(:assembly, "cannot be set while the part is installed directly on an aircraft")
  end

  def embedded_controller_requires_controller_function
    return if embedded_controller.nil? || function&.code == "CONTROLLER"

    errors.add(:function, "must be Controller while an embedded controller is assigned")
  end
end
