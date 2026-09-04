class PartInstallation < ApplicationRecord
  belongs_to :part
  belongs_to :assembly

  validates :installed_at, presence: true
  validate :removed_after_installation
  validate :part_has_no_other_active_installation

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

  def removed_after_installation
    errors.add(:removed_at, "must be after installation") if removed_at && installed_at && removed_at <= installed_at
  end

  def part_has_no_other_active_installation
    return unless active? && part

    duplicate = self.class.active.where(part:).where.not(id: id).exists?
    errors.add(:part, "already has an active assembly installation") if duplicate
  end
end
