class PartInstallation < ApplicationRecord
  belongs_to :part
  belongs_to :assembly

  validates :installed_at, presence: true
  validate :removed_after_installation
  validate :part_has_no_other_active_installation
  validate :assembly_accepts_parts, on: :create
  after_save :maintain_legacy_board_history

  scope :active, -> { where(removed_at: nil) }
  scope :covering, ->(time) { where("installed_at <= ? AND (removed_at IS NULL OR removed_at > ?)", time, time) }
  scope :recent, -> { order(installed_at: :desc, id: :desc) }

  def active?
    removed_at.nil?
  end

  def remove!(at: Time.current)
    update!(removed_at: at)
  end

  private

  def maintain_legacy_board_history
    controller = part.embedded_controller
    return unless controller && assembly.controlled_fdr?

    if saved_change_to_id?
      assembly.fdr_board_installations.create!(embedded_controller: controller, installed_at:, removed_at:)
    elsif saved_change_to_removed_at? && removed_at
      binding = assembly.fdr_board_installations.active.find_by(embedded_controller: controller, installed_at:)
      binding&.update!(removed_at:)
    end
    controller.association(:active_fdr_board_installation).reset
    assembly.association(:active_fdr_board_installation).reset
  end

  def assembly_accepts_parts
    errors.add(:assembly, "cannot be retired") if active? && assembly&.serviceability_state == "retired"
  end

  def removed_after_installation
    errors.add(:removed_at, "must be after installation") if removed_at && installed_at && removed_at <= installed_at
  end

  def part_has_no_other_active_installation
    return unless active? && part

    duplicate = self.class.active.where(part:).where.not(id: id).exists?
    errors.add(:part, "already has an active assembly installation") if duplicate
  end
end
