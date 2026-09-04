class HardwareDefinition < ApplicationRecord
  IMPLEMENTATION_KINDS = %w[perfboard pcb].freeze
  QUALIFICATION_STATES = %w[prototype qualification_in_progress flight_qualified withdrawn].freeze
  IDENTITY_ATTRIBUTES = %w[
    product_name family_code functional_version implementation_kind
    implementation_revision variant canonical_identifier
  ].freeze

  has_many :assemblies, dependent: :restrict_with_error

  before_validation :assign_canonical_identifier

  normalizes :product_name, with: ->(value) { value.to_s.strip.presence }
  normalizes :family_code, :implementation_revision, :variant,
    with: ->(value) { value.to_s.strip.upcase.presence }

  validates :product_name, :family_code, :implementation_revision, :canonical_identifier, presence: true
  validates :functional_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :implementation_kind, inclusion: { in: IMPLEMENTATION_KINDS }
  validates :qualification_state, inclusion: { in: QUALIFICATION_STATES }
  validates :canonical_identifier, uniqueness: true
  validate :implementation_fields_are_consistent
  validate :identity_is_immutable_once_used, on: :update

  scope :ordered, -> { order(:family_code, :functional_version, :implementation_kind, :implementation_revision, :variant) }

  def functional_configuration
    "#{family_code} V#{functional_version}"
  end

  def expected_canonical_identifier
    base = "#{family_code}-V#{functional_version}"
    implementation = if implementation_kind == "perfboard"
      "PERF-#{implementation_revision}"
    else
      "PCB-REV-#{implementation_revision}"
    end
    [ base, implementation, variant ].compact_blank.join("-")
  end

  def qualification_label
    {
      "prototype" => "Prototype — not flight-qualified",
      "qualification_in_progress" => "Qualification in progress",
      "flight_qualified" => "Flight-qualified",
      "withdrawn" => "Withdrawn"
    }.fetch(qualification_state)
  end

  def snapshot
    {
      "product_name" => product_name,
      "functional_configuration" => functional_configuration,
      "canonical_identifier" => canonical_identifier,
      "implementation_kind" => implementation_kind,
      "implementation_revision" => implementation_revision,
      "variant" => variant,
      "qualification_state" => qualification_state,
      "notion_url" => notion_url
    }
  end

  private

  def assign_canonical_identifier
    return if family_code.blank? || functional_version.nil? || implementation_kind.blank? || implementation_revision.blank?

    self.canonical_identifier = expected_canonical_identifier
  end

  def implementation_fields_are_consistent
    return if implementation_kind.blank? || implementation_revision.blank?

    if implementation_kind == "perfboard"
      errors.add(:implementation_revision, "must contain two digits for a perfboard build") unless implementation_revision.match?(/\A\d{2}\z/)
      errors.add(:variant, "must be blank for a perfboard build") if variant.present?
    elsif implementation_kind == "pcb"
      errors.add(:implementation_revision, "must contain revision letters for a PCB") unless implementation_revision.match?(/\A[A-Z]+\z/)
      errors.add(:variant, "must be present for a PCB variant") if variant.blank?
    end
  end

  def identity_is_immutable_once_used
    return unless assemblies.exists?
    return unless IDENTITY_ATTRIBUTES.any? { |attribute| will_save_change_to_attribute?(attribute) }

    errors.add(:base, "A hardware definition used by an assembly cannot be renamed")
  end
end
