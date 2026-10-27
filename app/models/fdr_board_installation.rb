class FdrBoardInstallation < ApplicationRecord
  belongs_to :assembly
  belongs_to :embedded_controller
  attr_readonly :assembly_id, :embedded_controller_id, :installed_at

  scope :active, -> { where(removed_at: nil) }
  scope :covering, ->(time) { where("installed_at <= ? AND (removed_at IS NULL OR removed_at > ?)", time, time) }
  scope :recent, -> { order(installed_at: :desc, id: :desc) }

  validates :installed_at, presence: true
  validates :assembly_id, :embedded_controller_id, uniqueness: { conditions: -> { active } }, if: -> { removed_at.nil? }
  validate :controlled_identity

  private

  def controlled_identity
    errors.add(:assembly, "must be an ExoFDR") unless assembly&.controlled_fdr?
    errors.add(:assembly, "is a logical system; bind the board to its module instead") if assembly&.fdr_system?
    errors.add(:assembly, "cannot be retired") if removed_at.nil? && assembly&.serviceability_state == "retired"
    errors.add(:removed_at, "must be after installation") if removed_at && installed_at && removed_at <= installed_at
  end
end
