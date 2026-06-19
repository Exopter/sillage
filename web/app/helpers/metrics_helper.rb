module MetricsHelper
  def flight_code(jump)
    year = jump.display_started_at&.year || Time.current.year
    sequence = jump.id.to_i.positive? ? jump.id : 1

    format("GLD-%<year>d-%<sequence>03d", year:, sequence: sequence % 1_000)
  end

  def logbook_date(jump)
    jump.display_started_at.strftime("%d %b · %H:%M")
  end

  def logbook_max_altitude(jump)
    return "-" if jump.max_altitude_m.blank?

    "#{number_with_delimiter(jump.max_altitude_m.round, delimiter: " ")} m"
  end

  def logbook_status(jump)
    return [ "live", "Processing" ] if jump.video_processing?
    return [ "fault", "Video fault" ] if jump.video_failed?

    [ "ready", "Analysed" ]
  end

  def meters(value)
    return "-" if value.blank?

    number_to_human(value, units: { unit: "m", thousand: "km" }, precision: 3)
  end

  def speed_ms(value)
    return "-" if value.blank?

    "#{number_with_precision(value, precision: 1)} m/s"
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
