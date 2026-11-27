# A Lite recorder linked to a Sillage account from the mobile app. One active
# ownership per recorder; unlinking keeps the row for history.
class RecorderOwnership < ApplicationRecord
  NAME_LENGTH = 1..64

  belongs_to :embedded_controller
  belongs_to :user
  has_many :lite_recording_uploads, dependent: :restrict_with_error

  normalizes :name, with: ->(name) { name.to_s.strip }

  validates :name, length: { in: NAME_LENGTH }
  validates :linked_at, presence: true

  scope :active, -> { where(unlinked_at: nil) }

  def self.default_name(device_id)
    "Lite #{device_id.to_s.last(6)}"
  end

  # Unlinking revokes the key: the recorder must be claimed again to authenticate.
  def unlink!(at: Time.current)
    embedded_controller.with_lock do
      update!(unlinked_at: at)
      embedded_controller.revoke_fdr_auth_key!
      embedded_controller.record_activity!("app_unlinked", source: "mobile_app", actor: user, occurred_at: at)
    end
  end

  def last_seen_at
    [ embedded_controller.last_identified_at, lite_recording_uploads.maximum(:created_at) ].compact.max
  end

  def last_flight_at
    Flight.where(flight_import_id: lite_recording_uploads.where.not(flight_import_id: nil).select(:flight_import_id))
      .maximum(:started_at)
  end
end
