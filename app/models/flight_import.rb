class FlightImport < ApplicationRecord
  STATUSES = %w[pending processing imported failed].freeze

  belongs_to :user
  belongs_to :aircraft, optional: true
  belongs_to :landing_zone, optional: true
  belongs_to :target_flight, class_name: "Flight", optional: true
  has_many :flights, dependent: :destroy, inverse_of: :flight_import
  has_many_attached :source_files

  validates :status, inclusion: { in: STATUSES }
  validates :import_type, inclusion: { in: %w[flysight exofdr] }

  scope :recent, -> { order(created_at: :desc) }

  def imported?
    status == "imported"
  end

  def pending?
    status == "pending"
  end

  def processing?
    status == "processing"
  end

  def failed?
    status == "failed"
  end
end
