class Aircraft < ApplicationRecord
  has_many :installations, dependent: :restrict_with_error
  has_many :flights, dependent: :restrict_with_error
  has_many :flight_imports, dependent: :nullify

  normalizes :registration, with: ->(value) { value.to_s.strip.upcase }

  validates :registration, :name, presence: true
  validates :registration, uniqueness: true

  scope :active, -> { where(active: true) }
  scope :ordered, -> { order(:registration) }

  def display_name
    [ name, registration ].compact_blank.join(" · ")
  end

  def active_installations
    installations.active.includes(:installable)
  end

  def configuration_snapshot(at: nil)
    recorded_installations = at ? installations.covering(at).includes(:installable) : active_installations
    {
      "aircraft" => { "registration" => registration, "name" => name },
      "effective_at" => at&.iso8601,
      "history_limitations" => at ? [ "Aircraft and asset metadata reflect the time of capture." ] : [],
      "installations" => recorded_installations.map do |installation|
        installable = installation.installable
        asset_snapshot = installable.is_a?(Assembly) ? installable.snapshot(at:) : installable.snapshot
        {
          "type" => installation.installable_type,
          "installed_at" => installation.installed_at.iso8601,
          "asset" => asset_snapshot
        }
      end
    }
  end

  def deletion_blockers
    [].tap do |blockers|
      blockers << "flight history" if flights.exists?
      blockers << "installation history" if installations.exists?
    end
  end
end
