module Flights
  class DetectLocation
    SOURCE = "openstreetmap"

    def initialize(flight, geocoder: OpenStreetMapReverseGeocoder.new)
      @flight = flight
      @geocoder = geocoder
    end

    def call
      return @flight.location if @flight.location.present?

      point = landing_point
      return unless usable_coordinates?(point)

      location = @geocoder.reverse(latitude: point.lat, longitude: point.lon).to_s.strip.presence
      return unless location

      updated = Flight.where(id: @flight.id)
        .where("NULLIF(BTRIM(location), '') IS NULL")
        .update_all(location:, location_source: SOURCE, updated_at: Time.current)
      @flight.reload.location if updated.positive?
    end

    private

    def landing_point
      points = @flight.track_points.where.not(lat: nil, lon: nil)
      return points.order(elapsed_seconds: :desc, recorded_at: :desc).first unless @flight.landing_at

      points.where.not(recorded_at: nil)
        .where("recorded_at <= ?", @flight.landing_at)
        .order(recorded_at: :desc)
        .first ||
        points.where.not(recorded_at: nil)
          .where("recorded_at > ?", @flight.landing_at)
          .order(:recorded_at)
          .first ||
        points.order(elapsed_seconds: :desc, recorded_at: :desc).first
    end

    def usable_coordinates?(point)
      return false unless point

      lat = point.lat.to_f
      lon = point.lon.to_f
      lat.finite? && lon.finite? && lat.between?(-90, 90) && lon.between?(-180, 180) && !(lat.zero? && lon.zero?)
    end
  end
end
