class Assembly < ApplicationRecord
  belongs_to :parent, class_name: "Assembly", optional: true, inverse_of: :children
  has_many :children, class_name: "Assembly", foreign_key: :parent_id,
    inverse_of: :parent, dependent: :restrict_with_error
  has_many :parts, dependent: :restrict_with_error
  has_many :builds, dependent: :restrict_with_error

  normalizes :code, with: ->(code) { code.to_s.strip.upcase }

  validates :code, :name, presence: true
  validates :code, uniqueness: true
  validate :parent_does_not_create_cycle

  scope :roots, -> { where(parent_id: nil) }
  scope :ordered, -> { order(:code) }

  def snapshot
    {
      "code" => code,
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

  private

  def parent_does_not_create_cycle
    return if parent.nil?

    errors.add(:parent, "cannot be the assembly itself") if parent == self
    errors.add(:parent, "cannot be one of its descendants") if persisted? && descendant_ids.include?(parent_id)
  end
end
