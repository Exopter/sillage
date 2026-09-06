class Assembly < ApplicationRecord
  include AssetIdentifiable

  EXOFDR_SERIAL_SEQUENCE = "exofdr_serial_number"
  EXOFDR_SERIAL_PATTERN = /\AFDR-\d{4}\z/
  EXOFDR_SERIAL_MAXIMUM = 9_999
  SERVICEABILITY_STATES = %w[in_preparation serviceable quarantined retired].freeze

  belongs_to :parent, class_name: "Assembly", optional: true, inverse_of: :children
  belongs_to :hardware_definition, optional: true
  has_many :children, class_name: "Assembly", foreign_key: :parent_id,
    inverse_of: :parent, dependent: :restrict_with_error
  has_many :part_installations, dependent: :restrict_with_error
  has_many :active_part_installations, -> { active }, class_name: "PartInstallation"
  has_many :parts, through: :active_part_installations
  has_many :builds, dependent: :restrict_with_error
  has_many :installations, as: :installable, dependent: :restrict_with_error

  normalizes :internal_number, with: ->(number) { number.to_s.strip.upcase.presence }
  normalizes :serial_number, with: ->(number) { number.to_s.strip.upcase.presence }

  before_validation :assign_exofdr_serial_number

  validates :name, presence: true
  validates :internal_number, uniqueness: true, allow_nil: true
  validates :internal_number, format: { with: AssetIdentifier::PATTERN }, allow_nil: true
  validates :serial_number, uniqueness: { case_sensitive: false }, allow_blank: true
  validates :serial_number, format: { with: EXOFDR_SERIAL_PATTERN }, allow_blank: true, if: :controlled_fdr?
  validates :serial_number, presence: true, if: :controlled_fdr?
  validates :serviceability_state, inclusion: { in: SERVICEABILITY_STATES }
  validate :exofdr_serial_number_is_generated, on: :create
  validate :serial_number_is_immutable, on: :update
  validate :parent_does_not_create_cycle
  validate :parent_does_not_conflict_with_aircraft_installation
  validate :serviceable_assembly_has_controlled_identity

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:internal_number) }

  def snapshot(at: nil, tree: nil)
    unless at || tree
      nodes = [ self, *Assembly.where(id: descendant_ids) ]
      ActiveRecord::Associations::Preloader.new(records: nodes,
        associations: [ :hardware_definition, { parts: [ :function, :embedded_controller ] } ]).call
      tree = nodes.drop(1).group_by(&:parent_id)
    end
    recorded_parts = if at
      Part.where(id: part_installations.covering(at).select(:part_id)).includes(:function, :embedded_controller).ordered
    else
      parts.sort_by { |part| [ part.internal_number.nil? ? 1 : 0, part.internal_number.to_s ] }
    end
    {
      "internal_number" => internal_number,
      "name" => name,
      "serial_number" => serial_number,
      "serviceability_state" => serviceability_state,
      "hardware_definition" => hardware_definition&.snapshot,
      "parts" => recorded_parts.map(&:snapshot),
      "assemblies" => at ? [] : Array(tree[id]).sort_by { |child| [ child.internal_number.nil? ? 1 : 0, child.internal_number.to_s ] }.map { |child| child.snapshot(tree:) },
      # Parent assignments and mutable asset metadata have no temporal history.
      "history_limitations" => at ? [ "Subassembly membership is not recorded historically.", "Asset metadata reflects the time of capture." ] : []
    }
  end

  def descendant_ids
    return [] unless persisted?

    sql = self.class.sanitize_sql_array([ <<~SQL, id ])
      WITH RECURSIVE descendants AS (
        SELECT id FROM assemblies WHERE parent_id = ?
        UNION
        SELECT assemblies.id FROM assemblies JOIN descendants ON assemblies.parent_id = descendants.id
      ) SELECT id FROM descendants
    SQL
    self.class.connection_pool.with_connection { |connection| connection.select_values(sql) }
  end

  def contains_part?(part)
    snapshot_part_numbers.include?(part.internal_number)
  end

  def controller_part
    parts.includes(:function, :embedded_controller).find { |part| part.function.code == "CONTROLLER" }
  end

  def embedded_controller
    controller_part&.embedded_controller
  end

  def serial_label
    serial_number.present? ? "S/N #{serial_number}" : "S/N not assigned"
  end

  def identity_label
    controlled_fdr? ? serial_label : "Asset ID #{internal_number}"
  end

  def display_name
    controlled_fdr? ? product_name : name
  end

  def selection_label
    [ identity_label, display_name, (hardware_label if controlled_fdr?) ].compact.join(" · ")
  end

  def serviceability_label
    serviceability_state.humanize
  end

  def hardware_label
    hardware_definition&.canonical_identifier || "Hardware definition not assigned"
  end

  def functional_configuration
    hardware_definition&.functional_configuration
  end

  def product_name
    hardware_definition&.product_name || name
  end

  def controlled_fdr?
    hardware_definition&.product_name == "ExoFDR" && hardware_definition.family_code == "FDR"
  end

  def snapshot_part_numbers
    Part.joins(:active_part_installation).where(part_installations: { assembly_id: [ id, *descendant_ids ] }).pluck(:internal_number)
  end

  def deletion_blockers
    [].tap do |blockers|
      blockers << "part installation history" if part_installations.exists?
      blockers << "subassemblies" if children.exists?
      blockers << "build history" if builds.exists?
      blockers << "installation history" if installations.exists?
    end
  end

  private

  def assign_exofdr_serial_number
    return unless controlled_fdr? && serial_number.blank?

    sequence = IdentifierSequence.next_value!(EXOFDR_SERIAL_SEQUENCE)
    raise RangeError, "The ExoFDR serial-number range is exhausted" if sequence > EXOFDR_SERIAL_MAXIMUM

    self.serial_number = format("FDR-%04d", sequence)
    @generated_exofdr_serial_number = true
  end

  def exofdr_serial_number_is_generated
    return unless controlled_fdr? && serial_number.present?
    return if @generated_exofdr_serial_number

    errors.add(:serial_number, "is assigned automatically")
  end

  def serial_number_is_immutable
    return unless serial_number_in_database.present? && will_save_change_to_serial_number?

    errors.add(:serial_number, "cannot be changed")
  end

  def parent_does_not_create_cycle
    return if parent.nil?

    errors.add(:parent, "cannot be the assembly itself") if parent == self
    errors.add(:parent, "cannot be one of its descendants") if persisted? && descendant_ids.include?(parent_id)
  end

  def parent_does_not_conflict_with_aircraft_installation
    return unless parent_id.present? && installations.active.exists?

    errors.add(:parent, "cannot be set while the assembly is installed on an aircraft")
  end

  def serviceable_assembly_has_controlled_identity
    return unless serviceability_state == "serviceable"

    errors.add(:hardware_definition, "must be assigned before the assembly is serviceable") unless hardware_definition
    errors.add(:serial_number, "must be assigned before the assembly is serviceable") if serial_number.blank?
  end
end
