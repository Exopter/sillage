module FlightDiagnosticsHelper
  IMU_ISSUE_LABELS = {
    "quality_unavailable" => "Quality telemetry lost",
    "attitude_unavailable" => "Attitude unavailable",
    "imu_quality_low" => "Orientation quality low",
    "heading_uncertain" => "Heading uncertain",
    "magnetic_disturbance" => "Magnetic disturbance"
  }.freeze

  def imu_event_presentation(event)
    issues = Array(event.metadata["issues"]).map { |issue| IMU_ISSUE_LABELS.fetch(issue, issue.humanize) }
    warnings = Array(event.metadata["warnings"])
    reason = event.label.to_s.delete_prefix("IMU: ")
    caution = issues.any? || warnings.any? || event.event_type == "warning" || event.metadata["invalidate_preflight_id"].present?
    {
      title: issues.first || warnings.first || reason.presence || "Status recorded",
      detail: (issues.drop(1) + warnings.reject { |warning| warning == warnings.first && issues.empty? }).join(" · "),
      reason:, tone: caution ? "caution" : "neutral", badge: caution ? "Attention" : "Recorded"
    }
  end

  def imu_check_result(check)
    return "Not recorded" unless check
    return "Recheck required" if check.invalidated_at

    "#{check.outcome.capitalize}#{' with warning' if check.summary['warnings'].present?}"
  end
end
