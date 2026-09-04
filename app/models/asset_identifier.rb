class AssetIdentifier < ApplicationRecord
  PREFIX = "EXO"
  DIGITS = 4
  MAXIMUM = (10**DIGITS) - 1
  PATTERN = /\A#{PREFIX}-\d{#{DIGITS}}\z/

  belongs_to :identifiable, polymorphic: true

  after_create :ensure_supported_range!

  validates :identifiable_type, uniqueness: { scope: :identifiable_id }

  def formatted
    ensure_supported_range!
    format("%s-%0#{DIGITS}d", PREFIX, id)
  end

  private

  def ensure_supported_range!
    return if id.to_i.between?(1, MAXIMUM)

    raise RangeError, "The Exopter internal Asset ID range is exhausted"
  end
end
