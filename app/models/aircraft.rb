class Aircraft < ApplicationRecord
  has_many :installations, dependent: :restrict_with_error
  has_many :flights, dependent: :restrict_with_error
  has_many :flight_imports, dependent: :nullify

  normalizes :registration, with: ->(value) { value.to_s.strip.upcase }
  normalizes :telemetry_system_id, with: ->(value) { value.to_s.strip.presence }

  validates :registration, :name, presence: true
  validates :registration, uniqueness: true
  validates :telemetry_system_id, uniqueness: true, allow_blank: true

  scope :active, -> { where(active: true) }
  scope :ordered, -> { order(:registration) }

  def display_name
    [ name, registration ].compact_blank.join(" · ")
  end

  def active_installations
    installations.active.includes(:installable)
  end

  def configuration_snapshot
    {
      "aircraft" => { "registration" => registration, "name" => name },
      "installations" => active_installations.map do |installation|
        installable = installation.installable
        {
          "type" => installation.installable_type,
          "installed_at" => installation.installed_at.iso8601,
          "asset" => installable.respond_to?(:snapshot) ? installable.snapshot : {
            "internal_number" => installable.internal_number,
            "manufacturer" => installable.manufacturer,
            "model" => installable.model,
            "serial_number" => installable.serial_number
          }
        }
      end
    }
  end
end
