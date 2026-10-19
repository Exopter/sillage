module Flights
  # Full replay analysis and explicit summary refreshes. Cache only
  # derived data; callers must authorize the Flight before using this service.
  class ProcessedTrack
    def self.version(flight)
      [ flight.track_points, flight.sensor_samples ].map { |scope| TrackSource.version(scope) }
    end

    def self.call(flight, version: self.version(flight))
      Rails.cache.fetch([ "processed-flight-v2", TrackQuality::VERSION, flight.cache_key_with_version, version ], expires_in: 30.minutes) do
        new(flight).call
      end
    end

    def initialize(flight)
      @flight = flight
    end

    def call
      source = TrackSource.new(@flight)
      result = TrackProcessing.new(track_points: source.points, sensor_samples: AnalysisSensors.new(@flight), origin_time: @flight.started_at,
        sensor_count: @flight.sensor_samples.count).call
      { points: result.points, analysis: result.analysis, summary: result.summary,
        quality: { rejected_count: result.quality.rejected_count, gaps: result.quality.gaps, source_unavailable: source.source_unavailable } }
    end
  end
end
