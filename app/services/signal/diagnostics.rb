module Signal
  # Project only diagnostics from the immutable batches. This keeps the complete
  # session available after an onboard recording replaces derived flight samples.
  class Diagnostics
    TYPES = %w[RADIO IMU_QUALITY].freeze

    def self.samples(sessions, type:)
      raise ArgumentError, "Unsupported diagnostic type" unless TYPES.include?(type)

      path = "$.samples[*] ? (@.sensor_type == \"#{type}\")"
      projection = SignalBatch.sanitize_sql_array([ "jsonb_path_query_array(payload::jsonb, ?::jsonpath)", path ])
      SignalBatch.where(signal_session_id: sessions.select(:id)).order(:signal_session_id, :sequence)
        .pluck(:signal_session_id, Arel.sql(projection)).flat_map do |session_id, samples|
          samples.map { |sample| [ session_id, sample ] }
        end
    end
  end
end
