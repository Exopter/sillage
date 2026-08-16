module AssetIdentifiable
  extend ActiveSupport::Concern

  included do
    after_create :assign_generated_internal_number, if: -> { internal_number.blank? }

    validates :internal_number, presence: true, on: :update
    validate :internal_number_is_immutable, on: :update
  end

  private

  def assign_generated_internal_number
    generated_number = format("%s-%06d", self.class::ASSET_IDENTIFIER_PREFIX, id)
    update_column(:internal_number, generated_number)
  end

  def internal_number_is_immutable
    return unless will_save_change_to_internal_number?

    errors.add(:internal_number, "cannot be changed")
  end
end
