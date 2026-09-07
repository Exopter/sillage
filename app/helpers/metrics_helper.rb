module MetricsHelper
  def flight_code(flight)
    flight.code
  end

  def logbook_value(value)
    return value if value.present?

    content_tag(:span, class: "flights-muted flights-data") do
      safe_join([ tag.span("—", aria: { hidden: true }), tag.span("Data unavailable", class: "sr-only") ])
    end
  end

  def logbook_date(entry)
    timestamp = entry.is_a?(FlightImport) ? entry.log_started_at : entry.display_started_at
    logbook_value(timestamp&.strftime("%d %b · %H:%M"))
  end

  def logbook_duration(value)
    logbook_value(value.present? ? duration(value) : nil)
  end

  def logbook_status(flight)
    return [ "unknown", "Preparation" ] if flight.preparation?
    return [ "live", "Live" ] if flight.live?
    return [ "caution", "Waiting for recording" ] if flight.waiting_for_recording?
    return [ "live", "Processing" ] if flight.processing?
    return [ "caution", "Review" ] if flight.review?
    return [ "live", "Processing" ] if flight.video_processing?
    return [ "fault", "Video fault" ] if flight.video_failed?
    return [ "fault", "Source missing" ] if flight.flight_import&.source_missing?
    return [ "caution", "Needs review" ] if flight.flight_import&.needs_activity_review?

    [ "ready", "Analysed" ]
  end

  def meters(value)
    return "—" if value.blank?

    number_to_human(value, units: { unit: "m", thousand: "km" }, precision: 3)
  end

  def duration(value)
    return "—" if value.blank?

    minutes = value.to_i / 60
    seconds = value.to_i % 60
    format("%02d:%02d", minutes, seconds)
  end

  def glide(value)
    return "—" if value.blank?

    number_with_precision(value, precision: 2)
  end

  def sample_count_with_rate(count, duration_seconds)
    count = count.to_i
    duration_seconds = duration_seconds.to_f
    rate = count / duration_seconds if duration_seconds.positive?
    rate_label = if rate
      number_with_precision(rate, precision: rate >= 10 ? 0 : 1, strip_insignificant_zeros: true)
    else
      "—"
    end

    "#{number_with_delimiter(count)} (#{rate_label} Hz)"
  end
end
