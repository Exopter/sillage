class Installation < ApplicationRecord
  belongs_to :aircraft
  belongs_to :installable, polymorphic: true

  after_commit :synchronize_part_state

  validates :installed_at, presence: true
  validate :removed_after_installation
  validate :asset_has_no_other_active_installation
  validate :part_is_serviceable
  validate :asset_is_not_nested

  scope :active, -> { where(removed_at: nil) }
  scope :recent, -> { order(installed_at: :desc) }

  def active?
    removed_at.nil?
  end

  def remove!(at: Time.current)
    update!(removed_at: at)
  end

  private

  def removed_after_installation
    errors.add(:removed_at, "must be after installation") if removed_at && installed_at && removed_at < installed_at
  end

  def asset_has_no_other_active_installation
    return unless active? && installable

    duplicate = self.class.active.where(installable: installable).where.not(id: id).exists?
    errors.add(:installable, "already has an active installation") if duplicate
  end

  def part_is_serviceable
    return unless installable.is_a?(Part) && installable.state.in?(%w[quarantined retired])

    errors.add(:installable, "must be serviceable")
  end

  def asset_is_not_nested
    return unless active?

    if installable.is_a?(Part) && installable.assembly_id.present?
      errors.add(:installable, "must be removed from its assembly before direct installation")
    elsif installable.is_a?(Assembly) && installable.parent_id.present?
      errors.add(:installable, "must be detached from its parent assembly before aircraft installation")
    end
  end

  def synchronize_part_state
    return unless installable.is_a?(Part)

    desired_state = installable.assembly_id.present? || installable.installations.active.exists? ? "installed" : "available"
    installable.update_column(:state, desired_state) if installable.state.in?(%w[available installed]) && installable.state != desired_state
  end
end
