module RecordingActivityHelper
  def recording_activity_label(flight_import)
    return "Source missing" if flight_import.source_missing?
    return "Included manually" if flight_import.included_in_flights_at?

    { "moving" => "Movement detected", "stationary" => "Stationary", "technical" => "Technical",
      "needs_review" => "Needs review" }.fetch(flight_import.activity_classification, "Not assessed")
  end

  def recording_activity_reason(flight_import)
    {
      "system_events_only" => "System events only; no flight telemetry.",
      "stationary_with_reliable_gps" => "Reliable GPS coverage with no significant movement detected.",
      "sustained_movement" => "Sustained movement detected in reliable GPS data.",
      "no_reliable_gps" => "GPS data is missing or insufficient to assess movement.",
      "operator_marker" => "An operator marker is present; kept for review.",
      "unsupported_records" => "Some records cannot be assessed automatically.",
      "short_recording" => "Too short to confidently establish immobility.",
      "incomplete_gps_coverage" => "GPS gaps or accuracy prevent a reliable immobility assessment.",
      "ambiguous_movement" => "Possible movement requires review.",
      "recovered_data" => "Recovered or incomplete data requires review.",
      "related_recording_activity" => "Adjacent to a moving segment from the same recorder boot; kept together.",
      "source_missing" => "The original source file is missing from storage.",
      "source_unavailable" => "The original source file is missing from storage.",
      "source_unreadable" => "The original source could not be decoded or verified."
    }.fetch(flight_import.activity_summary["reason"], "Activity has not been assessed yet.")
  end

  def recording_logbook_status(flight_import)
    return [ "fault", "Source missing" ] if flight_import.source_missing?
    return [ "fault", "Import failed" ] if flight_import.failed?
    return [ "live", "Processing" ] if flight_import.pending? || flight_import.processing?
    return [ "unknown", recording_activity_label(flight_import) ] if flight_import.set_aside?
    return [ "caution", "Needs review" ] if flight_import.needs_activity_review?

    [ "ready", "Imported" ]
  end
end
