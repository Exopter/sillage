module Flights
  class RoutePreview
    # One bounded payload for the selected flight; no telemetry is loaded for
    # off-screen entries. Preserve the endpoints of the recorded trajectory.
    def self.call(flight)
      return [] unless flight.is_a?(Flight)

      version = TrackSource.version(flight.track_points)
      Rails.cache.fetch([ "flight-route-preview", TrackQuality::VERSION, flight.cache_key_with_version, version ], expires_in: 30.minutes) do
        prepared = TrackMetrics.new(TrackSource.new(flight).points).prepared_points
        points = TrackQuality.new(prepared).call.points
        sampled = SampleTrack.call(points, limit: 400)
        segmented = sampled.any? { |point| point[:segment].to_i.positive? }
        sampled.map do |point|
          coordinate = [ point[:lat], point[:lon] ]
          segmented ? coordinate + [ point[:segment] ] : coordinate
        end
      end
    end
  end
end
