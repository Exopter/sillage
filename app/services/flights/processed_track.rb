module Flights
  # Full replay analysis and explicit summary refreshes. Cache only
  # derived data; callers must authorize the Flight before using this service.
  class ProcessedTrack
    def self.version(flight)
      [ flight.track_points, flight.sensor_samples ].map { |scope| TrackSource.version(scope) }
    end

    def self.call(flight, version: self.version(flight))
      Rails.cache.fetch([ "processed-flight", TrackQuality::VERSION, flight.cache_key_with_version, version ], expires_in: 30.minutes) do
        new(flight).call
      end
    end

    def initialize(flight)
      @flight = flight
    end

    def call
      source = TrackSource.new(@flight)
      result = TrackProcessing.new(track_points: source.points, sensor_samples: analysis_samples, origin_time: @flight.started_at,
        sensor_count: @flight.sensor_samples.count).call
      { points: result.points, analysis: result.analysis, summary: result.summary,
        quality: { rejected_count: result.quality.rejected_count, gaps: result.quality.gaps, source_unavailable: source.source_unavailable } }
    end

    private

    # Keep pressure analysis at full resolution, but project its two readings
    # directly instead of instantiating hundreds of thousands of model objects.
    # The lazy mapping is consumed once by FlightAnalysis.
    def analysis_samples
      Enumerator.new do |samples|
        @flight.sensor_samples.where(sensor_type: "BARO").ordered
          .pluck(:recorded_at, :elapsed_seconds, Arel.sql("readings -> 'pressure_altitude_m'"), Arel.sql("readings -> 'pressure'"))
          .each do |recorded_at, elapsed_seconds, altitude, pressure|
            samples << { sensor_type: "BARO", recorded_at:, elapsed_seconds:,
              readings: { "pressure_altitude_m" => altitude, "pressure" => pressure } }
          end
        scope = @flight.sensor_samples.ordered
        [ scope.pick(:recorded_at, :elapsed_seconds), scope.reverse_order.pick(:recorded_at, :elapsed_seconds) ].compact.each do |recorded_at, elapsed_seconds|
          samples << { sensor_type: "TIMELINE", recorded_at:, elapsed_seconds: }
        end
      end
    end
  end
end
