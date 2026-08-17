module MetricsHelper
  def flight_code(flight)
    flight.code
  end

  def logbook_date(flight)
    flight.display_started_at.strftime("%d %b · %H:%M")
  end

  def logbook_status(flight)
    return [ "unknown", "Preparation" ] if flight.preparation?
    return [ "live", "Live" ] if flight.live?
    return [ "live", "Processing" ] if flight.processing?
    return [ "caution", "Review" ] if flight.review?
    return [ "live", "Processing" ] if flight.video_processing?
    return [ "fault", "Video fault" ] if flight.video_failed?

    [ "ready", "Analysed" ]
  end

  def meters(value)
    return "-" if value.blank?

    number_to_human(value, units: { unit: "m", thousand: "km" }, precision: 3)
  end

  def duration(value)
    return "-" if value.blank?

    minutes = value.to_i / 60
    seconds = value.to_i % 60
    format("%02d:%02d", minutes, seconds)
  end

  def glide(value)
    return "-" if value.blank?

    number_with_precision(value, precision: 2)
  end
end
