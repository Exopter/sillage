module Signal
  class ReconcileRecording
    def initialize(flight_import)
      @import = flight_import
    end

    def call
      @import.with_lock do
        return unless @import.imported? && @import.import_type == "exofdr" && @import.target_flight_id.nil?

        sources = @import.flights.to_a
        return unless sources.one?

        source = sources.first
        return unless source.started_at && source.ended_at && source.ended_at > source.started_at

        boot_ids = Array(@import.details.to_h["files"]).filter_map { |file| file.dig("header", "boot_id") }.uniq
        device_id = FdrIdentity::DeviceId.normalize(@import.device_id)
        return unless boot_ids.one? && FdrIdentity::DeviceId.valid?(device_id)

        sessions = @import.user.signal_sessions.where(status: "completed").where.not(flight_id: nil)
          .where("started_at < ? AND ended_at > ?", source.ended_at, source.started_at)
        matching_session_ids = Diagnostics.samples(sessions, type: "IMU_QUALITY").filter_map do |session_id, sample|
          readings = sample["readings"].to_h
          next unless FdrIdentity::DeviceId.normalize(readings["deviceId"]) == device_id && readings["bootId"] == boot_ids.first
          observed_at = Time.iso8601(sample["recorded_at"].to_s) rescue nil
          next unless observed_at && observed_at.between?(source.started_at, source.ended_at)

          session_id
        end.uniq
        candidate_ids = sessions.where(id: matching_session_ids).distinct.pluck(:flight_id)
        return unless candidate_ids.one?

        target = Flight.visible_to(@import.user).find_by(id: candidate_ids.first)
        return unless target&.waiting_for_recording? && target.flight_import_id.nil?

        Flights::MergeRecording.new(flight_import: @import, target_flight: target).call
      end
    rescue Flights::MergeRecording::InvalidMerge => error
      Rails.logger.info("Signal reconciliation retained import #{@import.id} for review: #{error.message}")
      nil
    end
  end
end
