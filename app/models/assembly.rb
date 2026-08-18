class Assembly < ApplicationRecord
  include AssetIdentifiable

  belongs_to :parent, class_name: "Assembly", optional: true, inverse_of: :children
  has_many :children, class_name: "Assembly", foreign_key: :parent_id,
    inverse_of: :parent, dependent: :restrict_with_error
  has_many :parts, dependent: :restrict_with_error
  has_many :builds, dependent: :restrict_with_error
  has_many :installations, as: :installable, dependent: :restrict_with_error
  has_one :embedded_device, dependent: :restrict_with_error, inverse_of: :assembly

  normalizes :internal_number, with: ->(number) { number.to_s.strip.upcase.presence }

  validates :name, presence: true
  validates :internal_number, uniqueness: true, allow_nil: true
  validates :internal_number, format: { with: /\AEXO-\d{6,}\z/ }, allow_nil: true
  validate :parent_does_not_create_cycle
  validate :parent_does_not_conflict_with_aircraft_installation

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:internal_number) }

  def snapshot
    {
      "internal_number" => internal_number,
      "name" => name,
      "parts" => parts.includes(:function).ordered.map do |part|
        {
          "internal_number" => part.internal_number,
          "function" => part.function.name,
          "function_code" => part.function.code,
          "manufacturer" => part.manufacturer,
          "model" => part.model,
          "serial_number" => part.serial_number
        }
      end,
      "assemblies" => children.ordered.map(&:snapshot)
    }
  end

  def descendant_ids
    children.flat_map { |child| [ child.id, *child.descendant_ids ] }
  end

  def contains_part?(part)
    snapshot_part_numbers.include?(part.internal_number)
  end

  def snapshot_part_numbers
    own = parts.pluck(:internal_number)
    own + children.flat_map(&:snapshot_part_numbers)
  end

  def deletion_blockers
    [].tap do |blockers|
      blockers << "installed parts" if parts.exists?
      blockers << "subassemblies" if children.exists?
      blockers << "build history" if builds.exists?
      blockers << "installation history" if installations.exists?
      blockers << "an embedded device record" if embedded_device.present?
    end
  end

  private

  def parent_does_not_create_cycle
    return if parent.nil?

    errors.add(:parent, "cannot be the assembly itself") if parent == self
    errors.add(:parent, "cannot be one of its descendants") if persisted? && descendant_ids.include?(parent_id)
  end

  def parent_does_not_conflict_with_aircraft_installation
    return unless parent_id.present? && installations.active.exists?

    errors.add(:parent, "cannot be set while the assembly is installed on an aircraft")
  end
end
