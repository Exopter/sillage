require "digest"

module Signal
  class IngestBatch
    InvalidBatch = Class.new(StandardError)
    SessionCompleted = Class.new(StandardError)
    GPS_NUMBERS = %w[
      elapsed_seconds altitude_m vel_n_mps vel_e_mps vel_d_mps
      horizontal_accuracy_m vertical_accuracy_m speed_accuracy_mps heading_deg course_accuracy_deg
      horizontal_speed_mps vertical_speed_mps glide_ratio distance_from_start_m
    ].freeze

    def initialize(signal_session:, sequence:, payload:)
      @signal_session = signal_session
      unless /\A[0-9]+\z/.match?(sequence.to_s) && sequence.to_i <= 2_147_483_647
        raise InvalidBatch, "sequence must be a non-negative 32-bit integer"
      end
      @sequence = sequence.to_i
      @payload = payload.to_h.deep_stringify_keys
    end

    def call
      @signal_session.with_lock do
        existing = @signal_session.signal_batches.find_by(sequence: @sequence)
        if existing
          @signal_session.acknowledge!(@sequence)
          return existing
        end
        raise SessionCompleted, "This Signal session is completed; start a new session to send new samples." if @signal_session.status == "completed"

        validate_samples!
        batch = @signal_session.signal_batches.create!(
          sequence: @sequence,
          first_received_at: parse_time(@payload["first_received_at"], "first_received_at"),
          last_received_at: parse_time(@payload["last_received_at"], "last_received_at"),
          checksum: Digest::SHA256.hexdigest(@payload.to_json),
          payload: @payload
        )
        insert_track_points
        insert_sensor_samples
        identify_flight_source
        @signal_session.acknowledge!(@sequence)
        mark_flight_live
        broadcast(batch)
        batch
      end
    end

    private

    def samples
      @samples
    end

    def insert_track_points
      rows = samples.filter_map do |sample|
        next unless sample["kind"] == "gps"

        {
          flight_id: @signal_session.flight_id,
          recorded_at: sample["recorded_at"],
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
        }
      end
      TrackPoint.insert_all!(rows) if rows.any?
    end

    def insert_sensor_samples
      rows = samples.filter_map do |sample|
        next unless sample["kind"] == "sensor"

        {
          flight_id: @signal_session.flight_id,
          sensor_type: sample["sensor_type"].presence || "TELEMETRY",
          recorded_at: sample["recorded_at"],
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
      flight.with_lock do
        attributes = { status: "live", started_at: flight.started_at || @signal_session.started_at }
        attributes[:sample_count] = flight.sample_count.to_i + samples.count { |sample| sample["kind"] == "gps" }
        attributes[:sensor_sample_count] = flight.sensor_sample_count.to_i + samples.count { |sample| sample["kind"] == "sensor" }
        flight.update!(attributes)
      end
    end

    def identify_flight_source
      Signal::IdentifySource.new(
        signal_session: @signal_session,
        system_id: @payload["mavlink_system_id"] || @payload["telemetry_system_id"],
        component_id: @payload["mavlink_component_id"]
      ).call
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

    def validate_samples!
      raw = @payload.fetch("samples", [])
      raise InvalidBatch, "samples must be an array" unless raw.is_a?(Array)

      @samples = raw.each_with_index.map do |sample, index|
        path = "samples[#{index}]"
        raise InvalidBatch, "#{path} must be an object" unless sample.is_a?(Hash)
        sample = sample.deep_dup
        sample["recorded_at"] = parse_time(sample["recorded_at"], "#{path}.recorded_at")
        case sample["kind"]
        when "gps"
          sample["latitude"] = number(sample["latitude"] || sample["lat"], "#{path}.latitude", required: true, range: -90..90)
          sample["longitude"] = number(sample["longitude"] || sample["lon"], "#{path}.longitude", required: true, range: -180..180)
          GPS_NUMBERS.each { |key| sample[key] = number(sample[key], "#{path}.#{key}") }
          %w[gps_fix satellite_count].each do |key|
            value = number(sample[key], "#{path}.#{key}", range: 0..255)
            raise InvalidBatch, "#{path}.#{key} must be an integer" if value && value != value.to_i
            sample[key] = value&.to_i
          end
        when "sensor"
          sample["elapsed_seconds"] = number(sample["elapsed_seconds"], "#{path}.elapsed_seconds")
          unless sample["readings"].nil? || sample["readings"].is_a?(Hash)
            raise InvalidBatch, "#{path}.readings must be an object"
          end
          unless sample["sensor_type"].nil? || sample["sensor_type"].is_a?(String)
            raise InvalidBatch, "#{path}.sensor_type must be a string"
          end
        else
          raise InvalidBatch, "#{path}.kind must be gps or sensor"
        end
        sample
      end
    end

    def number(value, path, required: false, range: nil)
      return nil if value.nil? && !required

      numeric = Float(value) if value.is_a?(Numeric) || value.is_a?(String)
      raise InvalidBatch, "#{path} must be a finite number" unless numeric&.finite?
      raise InvalidBatch, "#{path} must be between #{range.first} and #{range.last}" if range && !range.cover?(numeric)
      numeric
    rescue ArgumentError, TypeError
      raise InvalidBatch, "#{path} must be a finite number"
    end

    def parse_time(value, path)
      return if value.nil?

      Time.zone.iso8601(value.to_s)
    rescue ArgumentError, TypeError
      raise InvalidBatch, "#{path} must be an ISO 8601 timestamp"
    end
  end
end
