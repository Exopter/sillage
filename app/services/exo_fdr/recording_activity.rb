module ExoFdr
  class RecordingActivity
    CONTEXT_GAP_US = 60_000_000

    def initialize(flight_import)
      @flight_import = flight_import
    end

    def summarize(segments)
      classification = %w[moving needs_review stationary technical].find { |value| segments.any? { |segment| segment["classification"] == value } }
      reason = segments.find { |segment| segment["classification"] == classification }&.fetch("reason")
      summary = { "version" => ActivityAssessment::VERSION, "classification" => classification || "needs_review",
        "reason" => reason || "no_reliable_gps", "segments" => segments,
        "boot_ids" => segments.map { |segment| segment["boot_id"] }.uniq,
        "duration_seconds" => segments.sum { |segment| segment["duration_seconds"].to_f } }
      if classification == "stationary" && related_imports(summary).any? { |candidate| related?(summary, candidate.activity_summary) }
        summary.merge!("classification" => "needs_review", "reason" => "related_recording_activity")
      end
      summary
    end

    # Run after the import transaction, so different imports never acquire each
    # other's row locks while holding the shared recorder-boot lock.
    def reconcile!
      summary = @flight_import.activity_summary
      return unless summary["segments"].to_a.any? { |segment| segment["classification"] == "moving" }

      related_imports(summary).where(activity_classification: "stationary").find_each do |candidate|
        next unless related?(candidate.activity_summary, summary)

        candidate.with_lock do
          next unless candidate.set_aside? && candidate.activity_classification == "stationary"

          candidate.update!(activity_classification: "needs_review",
            activity_summary: candidate.activity_summary.merge("classification" => "needs_review", "reason" => "related_recording_activity"))
          candidate.queue_activity_import! unless candidate.flights.exists?
        end
      end
    end

    private

    def related_imports(summary)
      return FlightImport.none if @flight_import.device_id.blank? || summary["boot_ids"].blank?

      @flight_import.user.flight_imports.where(device_id: @flight_import.device_id, status: "imported")
        .where.not(id: @flight_import.id)
        .where("EXISTS (SELECT 1 FROM jsonb_array_elements_text(activity_summary -> 'boot_ids') AS boot(value) WHERE boot.value IN (:boots))",
          boots: summary["boot_ids"].map(&:to_s))
    end

    def related?(stationary, moving)
      stationary["segments"].to_a.any? do |segment|
        moving["segments"].to_a.any? do |other|
          next false unless other["classification"] == "moving" && segment["boot_id"] == other["boot_id"]
          next false unless [ segment["min_us"], segment["max_us"], other["min_us"], other["max_us"] ].all?

          segment["min_us"] <= other["max_us"] + CONTEXT_GAP_US && other["min_us"] <= segment["max_us"] + CONTEXT_GAP_US
        end
      end
    end
  end
end
