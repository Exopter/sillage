module Flights
  # Read only the columns used by derived GPS geometry. Avoid retaining an
  # Active Record object and its attribute state for every recorded point.
  class TrackSource
    COLUMNS = %i[recorded_at elapsed_seconds lat lon altitude_m vel_n_mps vel_e_mps vel_d_mps
      horizontal_speed_mps vertical_speed_mps horizontal_accuracy_m vertical_accuracy_m
      speed_accuracy_mps gps_fix source_blob_id fdr_sequence].freeze

    attr_reader :source_unavailable

    def self.version(scope)
      count, last_id, updated_at = scope.pick(Arel.sql("COUNT(*)"), Arel.sql("MAX(id)"), Arel.sql("MAX(updated_at)"))
      [ count, last_id, updated_at&.utc&.iso8601(6) ]
    end

    def initialize(flight)
      @flight = flight
      @source_unavailable = false
    end

    def points
      @points ||= @flight.track_points.ordered.pluck(*COLUMNS).map { |values| COLUMNS.zip(values).to_h }.tap do |points|
        enrich_validity(points)
      end
    end

    private

    # Older rows retain NAV-PVT flags only in the original binary. Cache that
    # projection without backfilling or rewriting recorded measurements.
    def enrich_validity(points)
      points.group_by { |point| point[:source_blob_id] }.each do |blob_id, rows|
        next unless blob_id && rows.any? { |row| row[:fdr_sequence] }

        blob = @flight.flight_import&.source_files&.blobs&.find_by(id: blob_id)
        unless blob
          @source_unavailable = true
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
          @source_unavailable = true if row[:gps_flags].nil?
        end
      rescue ActiveStorage::FileNotFoundError, ActiveStorage::IntegrityError, ExoFdr::Error
        @source_unavailable = true
      end
    end
  end
end
