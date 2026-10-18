module Flights
  # Shared by replay, route previews and explicit summary refreshes. Cache only
  # derived data; callers must authorize the Flight before using this service.
  class ProcessedTrack
    def self.version(flight)
      [ flight.track_points, flight.sensor_samples ].map do |scope|
        count, last_id, updated_at = scope.pick(Arel.sql("COUNT(*)"), Arel.sql("MAX(id)"), Arel.sql("MAX(updated_at)"))
        [ count, last_id, updated_at&.utc&.iso8601(6) ]
      end
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
      points = @flight.track_points.ordered.map { |row| row.attributes.symbolize_keys }
      unavailable = enrich_validity(points)
      sensors = @flight.sensor_samples.where(sensor_type: "BARO").ordered.to_a
      sensors.concat([ @flight.sensor_samples.ordered.first, @flight.sensor_samples.ordered.last ].compact)
      result = TrackProcessing.new(track_points: points, sensor_samples: sensors, origin_time: @flight.started_at,
        sensor_count: @flight.sensor_samples.count).call
      { points: result.points, analysis: result.analysis, summary: result.summary,
        quality: { rejected_count: result.quality.rejected_count, gaps: result.quality.gaps, source_unavailable: unavailable } }
    end

    private

    # NAV-PVT flags are retained in the original binary, but older database rows
    # do not contain them. Read them without backfilling or rewriting those rows.
    def enrich_validity(points)
      unavailable = false
      points.group_by { |point| point[:source_blob_id] }.each do |blob_id, rows|
        next unless blob_id && rows.any? { |row| row[:fdr_sequence] }

        blob = @flight.flight_import&.source_files&.blobs&.find_by(id: blob_id)
        unless blob
          unavailable = true
          next
        end
        flags = Rails.cache.fetch([ "fdr-gps-flags-v1", blob.id, blob.checksum ]) do
          blob.open do |io|
            ExoFdr::Decoder.new(io).each_record.each_with_object({}) do |record, values|
              values[record["sequence"]] = record["gps_flags"] if record["type"] == "gps_pvt"
            end
          end
        end
        rows.each do |row|
          row[:gps_flags] = flags[row[:fdr_sequence]]
          unavailable = true if row[:gps_flags].nil?
        end
      rescue ActiveStorage::FileNotFoundError, ActiveStorage::IntegrityError, ExoFdr::Error
        unavailable = true
      end
      unavailable
    end
  end
end
