class LandingZone < ApplicationRecord
  has_many :flights, dependent: :restrict_with_error
  has_many :flight_imports, dependent: :nullify

  normalizes :code, with: ->(value) { value.to_s.strip.upcase }

  validates :code, :name, :latitude, :longitude, presence: true
  validates :code, uniqueness: true
  validates :latitude, numericality: { in: -90.0..90.0 }
  validates :longitude, numericality: { in: -180.0..180.0 }
  validates :detection_radius_km, numericality: { greater_than: 0 }

  scope :ordered, -> { order(:name) }

  def distance_to(latitude:, longitude:)
    earth_radius_km = 6_371.0
    lat1 = self.latitude.to_f * Math::PI / 180.0
    lat2 = latitude.to_f * Math::PI / 180.0
    delta_lat = lat2 - lat1
    delta_lon = (longitude.to_f - self.longitude.to_f) * Math::PI / 180.0
    a = Math.sin(delta_lat / 2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(delta_lon / 2)**2
    earth_radius_km * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  end

  def self.detect(latitude:, longitude:)
    candidates = all.filter_map do |zone|
      distance = zone.distance_to(latitude:, longitude:)
      [ zone, distance ] if distance <= zone.detection_radius_km
    end.sort_by(&:last)

    return if candidates.empty?
    return if candidates.second && (candidates.second.last - candidates.first.last) < 1.0

    candidates.first.first
  end
end
