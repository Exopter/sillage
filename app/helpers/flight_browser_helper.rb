module FlightBrowserHelper
  FOLDER_COLOR_LABELS = { "field" => "Sage", "sky" => "Sky", "aqua" => "Mint", "amber" => "Amber", "violet" => "Iris", "graphite" => "Slate" }.freeze

  def browser_key(entry)
    "#{entry.is_a?(FlightImport) ? 'import' : 'flight'}:#{entry.id}"
  end

  def browser_name(entry)
    entry.is_a?(FlightImport) ? entry.source_filename.presence || "Recording" : entry.title
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
      visibility: @visibility.presence_in(Flight::EFFECTIVE_VISIBILITIES), folder: @folder_filter, environment: @environment,
      page: (@page if @page.to_i > 1) }.compact
  end

  def browser_open_path(entry)
    return browser_path(recording: entry.id) if entry.is_a?(FlightImport)

    flight_path(entry, **(entry.logbook_view? ? browser_context : {}))
  end

  # A recording shows how long it runs; a flight shows how long it was flown.
  def browser_duration(entry)
    return entry.activity_summary["duration_seconds"] || entry.details.to_h["duration_seconds"] if entry.is_a?(FlightImport)
    # The list resolves its tunnel flights in one query; a single preview asks for its own.
    return @tunnel_flying_durations[entry.id] if entry.tunnel? && @tunnel_flying_durations

    entry.flight_duration_seconds
  end

  # A table cell without a value: a quiet dash, spelled out for screen readers.
  def browser_blank
    tag.span(class: "exds-browser-cell-blank") { safe_join([ tag.span("\u2013", aria: { hidden: true }), tag.span("Not recorded", class: "sr-only") ]) }
  end

  # The instant a row is dated by; nil when the flight only carries its logbook date.
  def browser_instant(entry)
    return entry.log_started_at if entry.is_a?(FlightImport)

    entry.display_started_at unless entry.flown_on && !entry.time_from_recording?
  end

  # Day header text. Instants are written in UTC, then regrouped in the viewer's zone by local_time.js.
  def browser_day(entry)
    date = browser_instant(entry)&.utc&.to_date || (entry.flown_on if entry.is_a?(Flight))
    date ? date.strftime(ApplicationHelper::LOCAL_TIME_FORMATS.fetch(:day)) : "Date not recorded"
  end

  def browser_time(entry)
    instant = browser_instant(entry)
    return local_time(instant, :clock) if instant

    entry.flown_at.strftime("%H:%M") if entry.is_a?(Flight) && entry.flown_at
  end

  # Muted text of the description cell: the recording type, or what stands in for a missing description.
  def browser_detail(entry)
    return entry.failed? ? entry.error_message : entry.import_type.upcase if entry.is_a?(FlightImport)
    return if entry.display_description

    entry.description&.match?(Flight::GENERATED_DESCRIPTION) ? "FlySight recording" : "No description"
  end

  # "club" reads as the Flight Club everywhere it is shown.
  def visibility_label(value)
    value == "club" ? "Flight Club" : value.to_s.capitalize
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
