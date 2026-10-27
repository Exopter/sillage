class FdrSystemMembership < ApplicationRecord
  belongs_to :system_assembly, class_name: "Assembly"
  belongs_to :module_assembly, class_name: "Assembly"
  attr_readonly :system_assembly_id, :module_assembly_id, :component_type, :installed_at

  scope :active, -> { where(removed_at: nil) }
  scope :covering, ->(time) { where("installed_at <= ? AND (removed_at IS NULL OR removed_at > ?)", time, time) }
  scope :recent, -> { order(installed_at: :desc, id: :desc) }

  validates :installed_at, presence: true
  validates :component_type, inclusion: { in: %w[MAIN CENTRAL AIRSPEED DISPLAY] }
  validate :valid_membership

  private

  def valid_membership
    errors.add(:system_assembly, "must be an ExoFDR SYSTEMS assembly") unless system_assembly&.fdr_system?
    errors.add(:module_assembly, "must match the module type") unless module_assembly&.fdr_module? && module_assembly.fdr_component_type == component_type
    errors.add(:removed_at, "must not precede installation") if removed_at && installed_at && removed_at < installed_at
    if removed_at_in_database && will_save_change_to_removed_at?
      errors.add(:removed_at, "cannot change a closed membership")
    end
  end
end
