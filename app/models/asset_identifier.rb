class AssetIdentifier < ApplicationRecord
  PREFIX = "EXO"

  belongs_to :identifiable, polymorphic: true

  validates :identifiable_type, uniqueness: { scope: :identifiable_id }

  def formatted
    format("%s-%06d", PREFIX, id)
  end
end
