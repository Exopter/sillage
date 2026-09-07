class Assembly < ApplicationRecord
  include AssetIdentifiable

  EXOFDR_SERIAL_PATTERN = /\AEXOFDR-V\d+-(PERF|PCB)-\d{2,}\z/
  ASSEMBLY_TYPES = [ "ExoFDR" ].freeze
  ASSEMBLY_METHODS = { "PERF" => "Perfboard", "PCB" => "PCB" }.freeze
  SERVICEABILITY_STATES = %w[in_preparation serviceable quarantined retired].freeze

  belongs_to :parent, class_name: "Assembly", optional: true, inverse_of: :children
  belongs_to :fdr_functional_configuration, optional: true
  has_many :children, class_name: "Assembly", foreign_key: :parent_id,
    inverse_of: :parent, dependent: :restrict_with_error
  has_many :part_installations, dependent: :restrict_with_error
  has_many :active_part_installations, -> { active }, class_name: "PartInstallation"
  has_many :parts, through: :active_part_installations
  has_many :builds, dependent: :restrict_with_error
  has_many :installations, as: :installable, dependent: :restrict_with_error

  normalizes :internal_number, with: ->(number) { number.to_s.strip.upcase.presence }
  normalizes :serial_number, with: ->(number) { number.to_s.strip.upcase.presence }

  before_create :assign_exofdr_serial_number
  before_destroy :retain_exofdr_identity

  validates :name, presence: true, unless: :controlled_fdr?
  # Nil identifies pre-existing generic equipment, never offered for new Hangar assemblies.
  validates :assembly_type, inclusion: { in: ASSEMBLY_TYPES }, allow_nil: true
  validates :fdr_functional_configuration, presence: true, if: :controlled_fdr?
  validates :assembly_method, inclusion: { in: ASSEMBLY_METHODS.keys }, if: :controlled_fdr?
  validates :internal_number, uniqueness: true, allow_nil: true
  validates :internal_number, format: { with: AssetIdentifier::PATTERN }, allow_nil: true
  validates :serial_number, uniqueness: { case_sensitive: false }, allow_blank: true
  validates :serial_number, format: { with: EXOFDR_SERIAL_PATTERN }, allow_blank: true, if: :controlled_fdr?
  validates :serial_number, presence: true, if: :controlled_fdr?, on: :update
  validates :serviceability_state, inclusion: { in: SERVICEABILITY_STATES }
  validate :exofdr_serial_number_is_generated, on: :create
  validate :serial_number_is_immutable, on: :update
  validate :configuration_is_immutable, on: :update
  validate :retirement_requires_detachment
  validate :parent_does_not_create_cycle
  validate :parent_does_not_conflict_with_aircraft_installation
  validate :serviceable_assembly_has_controlled_identity

  scope :roots, -> { where(parent_id: nil) }
  scope :not_retired, -> { where.not(serviceability_state: "retired") }
  scope :ordered, -> { order(:internal_number) }

  def snapshot(at: nil, tree: nil)
    unless at || tree
      nodes = [ self, *Assembly.where(id: descendant_ids) ]
      ActiveRecord::Associations::Preloader.new(records: nodes,
        associations: [ :fdr_functional_configuration, { parts: [ :function, :embedded_controller ] } ]).call
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
      "assembly_type" => assembly_type,
      "functional_configuration" => fdr_functional_configuration&.snapshot,
      "assembly_method" => assembly_method,
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
    serial_number.presence || "Not assigned"
  end

  def identity_label
    controlled_fdr? ? serial_label : "Asset ID #{internal_number}"
  end

  def display_name
    controlled_fdr? ? serial_label : name
  end

  def selection_label
    controlled_fdr? ? display_name : "#{name} · #{identity_label}"
  end

  def serviceability_label
    serviceability_state.humanize
  end

  def assembly_method_label
    ASSEMBLY_METHODS[assembly_method]
  end

  def functional_configuration
    fdr_functional_configuration&.label
  end

  def controlled_fdr?
    assembly_type == "ExoFDR"
  end

  def snapshot_part_numbers
    Part.joins(:active_part_installation).where(part_installations: { assembly_id: [ id, *descendant_ids ] }).pluck(:internal_number)
  end

  def deletion_blockers
    [].tap do |blockers|
      blockers << "a permanent ExoFDR identity; retire this assembly instead" if controlled_fdr?
      blockers << "part installation history" if part_installations.exists?
      blockers << "subassemblies" if children.exists?
      blockers << "build history" if builds.exists?
      blockers << "installation history" if installations.exists?
    end
  end

  private

  def assign_exofdr_serial_number
    return unless controlled_fdr?

    # Serialize issuance with catalogue edits so a used baseline cannot change concurrently.
    fdr_functional_configuration.lock!
    prefix = "EXOFDR-#{functional_configuration}-#{assembly_method}"
    self.serial_number = format("%s-%02d", prefix, IdentifierSequence.next_value!(prefix))
    self.name = serial_number
  end

  def exofdr_serial_number_is_generated
    return unless controlled_fdr? && serial_number.present?
    errors.add(:serial_number, "is assigned automatically")
  end

  def configuration_is_immutable
    %w[assembly_type fdr_functional_configuration_id assembly_method].each do |attribute|
      errors.add(attribute, "cannot be changed; retire this assembly and create a new one") if will_save_change_to_attribute?(attribute)
    end
    errors.add(:name, "is the generated serial number and cannot be changed") if controlled_fdr? && will_save_change_to_name?
    if serviceability_state_in_database == "retired" && will_save_change_to_serviceability_state?
      errors.add(:serviceability_state, "cannot be changed after retirement")
    end
  end

  def retain_exofdr_identity
    return unless controlled_fdr?

    errors.add(:base, "An ExoFDR identity must be retained. Retire the assembly instead.")
    throw(:abort)
  end

  def retirement_requires_detachment
    if serviceability_state == "retired" && (parent_id.present? || installations.active.exists?)
      errors.add(:serviceability_state, "requires removal from the aircraft and parent assembly before retirement")
    end
    if will_save_change_to_parent_id? && parent&.serviceability_state == "retired"
      errors.add(:parent, "cannot be retired")
    end
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

    errors.add(:assembly_type, "must be ExoFDR before the assembly is serviceable") unless controlled_fdr?
  end
end
