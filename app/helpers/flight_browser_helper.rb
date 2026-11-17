module FlightBrowserHelper
  FOLDER_COLOR_LABELS = { "field" => "Sage", "sky" => "Sky", "aqua" => "Mint", "amber" => "Amber", "violet" => "Iris", "graphite" => "Slate" }.freeze

  def browser_key(entry)
    "#{entry.is_a?(FlightImport) ? 'import' : 'flight'}:#{entry.id}"
  end

  def browser_name(entry)
    entry.is_a?(FlightImport) ? entry.source_filename.presence || "Recording" : entry.code
  end

  # Pilots offered when the pilot is changed in place: active users plus the current pilot.
  def flight_pilot_options(flight)
    @flight_pilot_options ||= User.available_as_pilot.order(:first_name, :last_name, :email_address).to_a
    @flight_pilot_options.include?(flight.pilot) ? @flight_pilot_options : [ flight.pilot, *@flight_pilot_options ]
  end

  # What the selected flights hold today for one field: the shared value, or how many differ.
  def bulk_current(flights, label, &value)
    values = flights.map(&value).tally
    return "Same on all: #{values.keys.first}" if values.one?

    "Now: #{values.size} different #{label.pluralize(values.size)}"
  end

  def browser_path(**options)
    flights_path(browser_context.merge(options))
  end

  def browser_context
    { filter: (@filter unless @filter == "flights"), q: @query.presence,
      visibility: @visibility.presence_in(Flight::EFFECTIVE_VISIBILITIES), folder: @folder_filter,
      page: (@page if @page.to_i > 1) }.compact
  end

  def browser_open_path(entry)
    return flights_path(recording: entry.id, filter: @filter, anchor: "recording-details") if entry.is_a?(FlightImport)

    flight_path(entry, **(entry.logbook_view? ? browser_context : {}))
  end

  def browser_duration(entry)
    entry.is_a?(FlightImport) ? entry.activity_summary["duration_seconds"] || entry.details.to_h["duration_seconds"] : entry.duration_seconds
  end

  def browser_date(entry)
    return logbook_date(entry) if entry.is_a?(Flight) && entry.flown_on && !entry.time_from_recording?

    timestamp = entry.is_a?(FlightImport) ? entry.log_started_at : entry.display_started_at
    return "Date not recorded" unless timestamp

    local_time(timestamp, :list)
  end

  def browser_duration_label(entry)
    value = browser_duration(entry)
    return if value.blank?

    minutes, seconds = value.to_i.divmod(60)
    hours, minutes = minutes.divmod(60)
    [ ("#{hours}h" if hours.positive?), ("#{minutes}m" if minutes.positive? || hours.positive?), "#{seconds}s" ].compact.join(" ")
  end

  def browser_visibility(entry)
    entry.is_a?(FlightImport) ? "private" : entry.effective_visibility
  end

  def browser_preview_path(entry)
    preview_flights_path(**browser_context, id: entry.id, kind: entry.is_a?(FlightImport) ? "import" : "flight")
  end

  def browser_folder_color(folder)
    browser_color_token(folder&.color)
  end

  def browser_color_token(color)
    "var(--ex-#{color.presence_in(FlightFolder::COLORS) || 'graphite'}-500)"
  end
end
