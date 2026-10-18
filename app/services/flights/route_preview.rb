module Flights
  class RoutePreview
    # One bounded payload for the selected flight; no telemetry is loaded for
    # off-screen entries. Preserve the endpoints of the recorded trajectory.
    def self.call(flight)
      return [] unless flight.is_a?(Flight)

      points = ProcessedTrack.call(flight).fetch(:points)
      sampled = SampleTrack.call(points, limit: 400)
      segmented = sampled.any? { |point| point[:segment].to_i.positive? }
      sampled.map do |point|
        coordinate = [ point[:lat], point[:lon] ]
        segmented ? coordinate + [ point[:segment] ] : coordinate
      end
    end
  end
end
