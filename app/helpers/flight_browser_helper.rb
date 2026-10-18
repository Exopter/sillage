module FlightBrowserHelper
  FOLDER_COLOR_LABELS = { "field" => "Sage", "sky" => "Sky", "aqua" => "Mint", "amber" => "Amber", "violet" => "Iris", "graphite" => "Slate" }.freeze

  def browser_key(entry)
    "#{entry.is_a?(FlightImport) ? 'import' : 'flight'}:#{entry.id}"
  end

  def browser_name(entry)
    entry.is_a?(FlightImport) ? entry.source_filename.presence || "Recording" : entry.code
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
