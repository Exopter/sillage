module Flights
  class RefreshAnalysis
    # Only derived Flight columns change. Source blobs, TrackPoint and
    # SensorSample rows, timestamps and provenance remain untouched.
    def self.call(flight)
      flight.with_lock do
        processed = ProcessedTrack.new(flight).call
        flight.update!(processed.fetch(:summary).merge(processed.fetch(:analysis).bounds))
      end
      flight
    end
  end
end
