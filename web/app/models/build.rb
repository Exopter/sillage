class Build < ApplicationRecord
  SHA256_PATTERN = /\A[0-9a-f]{64}\z/i
  COMPARABLE_CONFIGURATION = {
    source_revision: "Git revision",
    source_dirty: "Working tree modified",
    source_diff_sha256: "Source diff SHA-256",
    arduino_core_version: "Arduino Core",
    firmware_sha256: "Firmware SHA-256"
  }.freeze

  belongs_to :assembly
  belongs_to :previous_build, class_name: "Build", optional: true
  belongs_to :created_by, class_name: "User"
  has_many :test_runs, dependent: :restrict_with_error

  before_validation :capture_assembly_snapshot, on: :create
  before_update :prevent_changes_when_locked
  before_destroy :prevent_changes_when_locked

  normalizes :code, with: ->(code) { code.to_s.strip.upcase }

  validates :code, :arduino_core_version, presence: true
  validates :code, uniqueness: true
  validates :firmware_sha256, :source_diff_sha256,
    format: { with: SHA256_PATTERN, message: "must be a SHA-256 hash" }, allow_blank: true
  validate :previous_build_is_different

  scope :recent, -> { order(created_at: :desc) }

  def locked?
    locked_at.present?
  end

  def lock!
    update_column(:locked_at, Time.current) unless locked?
  end

  def refresh_snapshot!
    raise ActiveRecord::ReadOnlyRecord, "Tested builds are immutable" if locked?

    update!(assembly_snapshot: assembly.snapshot)
  end

  def clone_as_next!(by:)
    self.class.create!(
      code: self.class.next_code,
      assembly: assembly,
      previous_build: self,
      created_by: by,
      source_revision: source_revision,
      source_dirty: source_dirty,
      source_diff: source_diff,
      source_diff_sha256: source_diff_sha256,
      arduino_core_version: arduino_core_version,
      firmware_sha256: firmware_sha256,
      notion_references: notion_references,
      notes: notes
    )
  end

  def self.next_code
    highest = pluck(:code).filter_map { |value| value[/\AFDR-DEV-(\d+)\z/, 1]&.to_i }.max || 0
    format("FDR-DEV-%03d", highest + 1)
  end

  def part_changes
    return { added: [], removed: [] } unless previous_build

    current = flattened_parts(assembly_snapshot)
    previous = flattened_parts(previous_build.assembly_snapshot)
    {
      added: current.keys - previous.keys,
      removed: previous.keys - current.keys
    }
  end

  def configuration_changes
    return [] unless previous_build

    COMPARABLE_CONFIGURATION.filter_map do |attribute, label|
      previous_value = previous_build.public_send(attribute)
      current_value = public_send(attribute)
      next if previous_value == current_value

      { label: label, previous: previous_value, current: current_value }
    end
  end

  def contains_part?(part)
    flattened_parts(assembly_snapshot).key?(part.internal_number)
  end

  private

  def capture_assembly_snapshot
    self.assembly_snapshot = assembly.snapshot if assembly
  end

  def flattened_parts(node, result = {})
    Array(node["parts"]).each { |part| result[part.fetch("internal_number")] = part }
    Array(node["assemblies"]).each { |child| flattened_parts(child, result) }
    result
  end

  def prevent_changes_when_locked
    return true unless locked?

    errors.add(:base, "Tested builds are immutable. Clone this build to create the next iteration.")
    throw(:abort)
  end

  def previous_build_is_different
    errors.add(:previous_build, "must be different") if previous_build == self
  end
end
