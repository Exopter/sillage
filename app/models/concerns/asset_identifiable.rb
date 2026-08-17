module AssetIdentifiable
  extend ActiveSupport::Concern

  included do
    has_one :asset_identifier, as: :identifiable, inverse_of: :identifiable

    after_create :assign_generated_internal_number, if: -> { internal_number.blank? }

    validates :internal_number, presence: true, on: :update
    validate :internal_number_is_immutable, on: :update
  end

  private

  def assign_generated_internal_number
    identifier = AssetIdentifier.create!(identifiable: self)
    update_column(:internal_number, identifier.formatted)
  end

  def internal_number_is_immutable
    return unless will_save_change_to_internal_number?

    errors.add(:internal_number, "cannot be changed")
  end
end
