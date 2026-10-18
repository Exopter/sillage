module Flights
  class MergeRecording
    InvalidMerge = Class.new(StandardError)
    RECORDING_ATTRIBUTES = %w[
      status started_at ended_at exit_at opening_at landing_at duration_seconds
      min_altitude_m max_altitude_m altitude_loss_m distance_m max_horizontal_speed_mps
      max_vertical_speed_mps avg_glide_ratio sample_count sensor_sample_count
    ].freeze

    def initialize(flight_import:, target_flight:)
      @import, @target = flight_import, target_flight
    end

    def call
      @import.with_lock do
        raise InvalidMerge, "Select a completed ExoFDR import owned by this flight's owner." unless
          @import.imported? && @import.import_type == "exofdr" && @import.user_id == @target.user_id

        sources = @import.flights.reload.to_a
        raise InvalidMerge, "The import must contain exactly one flight." unless sources.one?

        source = sources.first
        return @target.reload if source.id == @target.id && @import.target_flight_id == @target.id

        sessions = SignalSession.where(flight_id: [ source.id, @target.id ]).order(:id).lock.to_a
        locked = Flight.where(id: [ source.id, @target.id ]).order(:id).lock.index_by(&:id)
        source, target = locked.values_at(source.id, @target.id)
        validate!(source, target, sessions)

        details = @import.details.to_h.deep_dup
        details["signal_reconciliation"] = {
          "target_flight_id" => target.id, "source_flight_id" => source.id,
          "source_flight_code" => source.code, "merged_at" => Time.current.iso8601,
          "source_flight" => source.attributes, "previous_target_flight" => target.attributes
        }
        target.track_points.delete_all
        target.sensor_samples.delete_all
        source.track_points.update_all(flight_id: target.id)
        source.sensor_samples.update_all(flight_id: target.id)
        target.update!(source.attributes.slice(*RECORDING_ATTRIBUTES).merge(flight_import: @import))
        @import.update!(target_flight: target, details:)
        source.destroy!
        target
      end
    end

    private

    def validate!(source, target, sessions)
      raise InvalidMerge, "A selected flight is no longer available." unless source && target
      raise InvalidMerge, "The Signal flight already has a recording." if target.flight_import_id.present? || @import.target_flight_id.present?
      raise InvalidMerge, "Complete the Signal session before attaching its recording." unless
        target.waiting_for_recording? && sessions.any? { |session| session.flight_id == target.id } && sessions.all? { |session| session.status == "completed" }
      raise InvalidMerge, "The imported flight contains additional context requiring manual review." if
        sessions.any? { |session| session.flight_id == source.id } || source.operator_events.exists? || source.imu_checks.exists? ||
        ActiveStorage::Attachment.where(record: source).exists? || source.notes.present? || source.folder_id.present? ||
        FlightImport.where(target_flight_id: source.id).exists?
      raise InvalidMerge, "The Signal telemetry has no retained source batches." unless
        SignalBatch.where(signal_session_id: sessions.map(&:id)).exists?
    end
  end
end
