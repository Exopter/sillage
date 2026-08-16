class Part < ApplicationRecord
  include AssetIdentifiable

  ASSET_IDENTIFIER_PREFIX = "PART"
  STATES = %w[available installed quarantined retired].freeze
  EDITABLE_STATES = %w[available quarantined retired].freeze

  belongs_to :function
  belongs_to :assembly, optional: true
  has_many :test_runs, dependent: :restrict_with_error
  has_many :installations, as: :installable, dependent: :restrict_with_error

  before_validation :synchronize_installation_state

  normalizes :internal_number, with: ->(number) { number.to_s.strip.upcase.presence }
  normalizes :serial_number, with: ->(number) { number.to_s.strip.presence }

  validates :model, presence: true
  validates :internal_number, uniqueness: true, allow_nil: true
  validates :internal_number, format: { with: /\APART-\d{6,}\z/ }, allow_nil: true
  validates :serial_number, uniqueness: { scope: :manufacturer }, allow_blank: true
  validates :state, inclusion: { in: STATES }
  validate :non_serviceable_part_is_not_installed
  validate :assembly_does_not_conflict_with_aircraft_installation

  scope :ordered, -> { order(:internal_number) }
  scope :available, -> { where(state: "available", assembly_id: nil) }

  def display_name
    [ manufacturer, model ].compact_blank.join(" ")
  end

  def install_in!(target_assembly)
    raise ActiveRecord::RecordInvalid, self unless state == "available" && assembly.nil?

    update!(assembly: target_assembly)
  end

  def remove_from_assembly!
    update!(assembly: nil)
  end

  def deletion_blockers
    [].tap do |blockers|
      blockers << "an assembly assignment" if assembly_id.present?
      blockers << "test history" if test_runs.exists?
      blockers << "installation history" if installations.exists?
    end
  end

  private

  def synchronize_installation_state
    actively_installed = persisted? && installations.active.exists?
    if assembly_id.present? || actively_installed
      self.state = "installed" if state.in?(%w[available installed])
    elsif state == "installed"
      self.state = "available"
    end
  end

  def non_serviceable_part_is_not_installed
    return unless (assembly_id.present? || installations.active.exists?) && state.in?(%w[quarantined retired])

    errors.add(:state, "cannot be installed while #{state}")
  end

  def assembly_does_not_conflict_with_aircraft_installation
    return unless assembly_id.present? && installations.active.exists?

    errors.add(:assembly, "cannot be set while the part is installed directly on an aircraft")
  end
end
