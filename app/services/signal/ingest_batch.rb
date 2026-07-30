require "digest"

module Signal
  class IngestBatch
    def initialize(signal_session:, sequence:, payload:)
      @signal_session = signal_session
      @sequence = Integer(sequence)
      @payload = payload.to_h.deep_stringify_keys
    end

    def call
      existing = @signal_session.signal_batches.find_by(sequence: @sequence)
      if existing
        @signal_session.acknowledge!(@sequence)
        return existing
      end

      SignalBatch.transaction do
        batch = @signal_session.signal_batches.create!(
          sequence: @sequence,
          first_received_at: parse_time(@payload["first_received_at"]),
          last_received_at: parse_time(@payload["last_received_at"]),
          checksum: Digest::SHA256.hexdigest(@payload.to_json),
          payload: @payload
        )
        insert_track_points
        insert_sensor_samples
        identify_flight_context
        @signal_session.acknowledge!(@sequence)
        mark_flight_live
        broadcast(batch)
        batch
      end
    rescue ActiveRecord::RecordNotUnique
      @signal_session.signal_batches.find_by!(sequence: @sequence)
    end

    private

    def samples
      Array(@payload["samples"])
    end

    def insert_track_points
      rows = samples.filter_map do |sample|
        sample = sample.to_h.deep_stringify_keys
        next unless sample["kind"] == "gps"

        {
          flight_id: @signal_session.flight_id,
          recorded_at: parse_time(sample["recorded_at"]),
          elapsed_seconds: sample["elapsed_seconds"],
          lat: sample["latitude"] || sample["lat"],
          lon: sample["longitude"] || sample["lon"],
          altitude_m: sample["altitude_m"],
          vel_n_mps: sample["vel_n_mps"],
          vel_e_mps: sample["vel_e_mps"],
          vel_d_mps: sample["vel_d_mps"],
          horizontal_accuracy_m: sample["horizontal_accuracy_m"],
          vertical_accuracy_m: sample["vertical_accuracy_m"],
          speed_accuracy_mps: sample["speed_accuracy_mps"],
          heading_deg: sample["heading_deg"],
          course_accuracy_deg: sample["course_accuracy_deg"],
          gps_fix: sample["gps_fix"],
          satellite_count: sample["satellite_count"],
          horizontal_speed_mps: sample["horizontal_speed_mps"],
          vertical_speed_mps: sample["vertical_speed_mps"],
          glide_ratio: sample["glide_ratio"],
          distance_from_start_m: sample["distance_from_start_m"],
          created_at: Time.current,
          updated_at: Time.current
        }.compact
      end
      TrackPoint.insert_all!(rows) if rows.any?
    end

    def insert_sensor_samples
      rows = samples.filter_map do |sample|
        sample = sample.to_h.deep_stringify_keys
        next unless sample["kind"] == "sensor"

        {
          flight_id: @signal_session.flight_id,
          sensor_type: sample["sensor_type"].presence || "TELEMETRY",
          recorded_at: parse_time(sample["recorded_at"]),
          elapsed_seconds: sample["elapsed_seconds"],
          readings: sample["readings"] || {},
          created_at: Time.current,
          updated_at: Time.current
        }
      end
      SensorSample.insert_all!(rows) if rows.any?
    end

    def mark_flight_live
      flight = @signal_session.flight
      attributes = { status: "live", started_at: flight.started_at || @signal_session.started_at }
      attributes[:sample_count] = flight.track_points.count
      attributes[:sensor_sample_count] = flight.sensor_samples.count
      flight.update!(attributes)
    end

    def identify_flight_context
      flight = @signal_session.flight
      attributes = {}
      if flight.aircraft_id.nil? && @payload["telemetry_system_id"].present?
        attributes[:aircraft] = Aircraft.find_by(telemetry_system_id: @payload["telemetry_system_id"].to_s)
      end
      if flight.landing_zone_id.nil? && @payload.dig("position", "latitude").present? && @payload.dig("position", "longitude").present?
        attributes[:landing_zone] = LandingZone.detect(
          latitude: @payload.dig("position", "latitude"),
          longitude: @payload.dig("position", "longitude")
        )
      end
      attributes.compact!
      flight.update!(attributes) if attributes.any?
      @signal_session.update!(station_metadata: @signal_session.station_metadata.merge("telemetry_system_id" => @payload["telemetry_system_id"])) if @payload["telemetry_system_id"].present?
    end

    def broadcast(batch)
      return unless defined?(SignalSessionChannel)

      SignalSessionChannel.broadcast_to(
        @signal_session,
        type: "batch",
        sequence: batch.sequence,
        acknowledged_sequence: @signal_session.last_acknowledged_sequence,
        samples: samples
      )
    end

    def parse_time(value)
      return if value.blank?

      Time.zone.parse(value.to_s)
    rescue ArgumentError
      nil
    end
  end
end
