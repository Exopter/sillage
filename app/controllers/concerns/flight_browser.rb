module FlightBrowser
  extend ActiveSupport::Concern

  private

  def load_browser_context
    @query = params[:q].to_s.strip
    @filter = params[:filter].presence_in(Flights::Logbook::FILTERS) || (@flight_import&.set_aside? ? "set_aside" : "flights")
    @visibility = (params[:visibility] == "team" ? "public" : params[:visibility]).presence_in(Flight::EFFECTIVE_VISIBILITIES) || "all"
    @folder_filter = requested_folder
    @page = [ params[:page].to_i, 1 ].max
  end

  def load_browser(panel: nil, focus: nil)
    load_browser_context
    @browser_workspace = true
    @browser_panel = panel
    @folders = FlightFolder.visible_to(Current.user).includes(:memberships).ordered
    @destination_folders = FlightFolder.contributable_to(Current.user).ordered
    @folder_filter ||= focus.folder_id.to_s if focus&.folder&.visible_to?(Current.user)
    @folder = @folders.find(@folder_filter) if @folder_filter && @folder_filter != "unfiled"
    entries = Flights::Logbook.new(user: Current.user, filter: @filter, query: @query, visibility: @visibility, folder: @folder_filter).page(@page)
    @next_page = @page + 1 if entries.size > Flights::Logbook::PER_PAGE
    @flights = entries.first(Flights::Logbook::PER_PAGE)
    visible = Flight.visible_to(Current.user)
    @folder_counts = visible.where.not(flight_import_id: FlightImport.set_aside.select(:id)).or(visible.where(flight_import_id: nil)).group(:folder_id).count
    @unfiled_count = Current.user.flights.where(folder_id: nil).count
    @browser_title = @folder&.name || (@folder_filter == "unfiled" ? "Unfiled" : @filter == "set_aside" ? "Excluded recordings" : "All flights")
    @selected_entry = if panel
      @flights.find { |entry| entry == focus }
    else
      @flights.find { |entry| "#{entry.is_a?(FlightImport) ? 'import' : 'flight'}:#{entry.id}" == params[:selected] } || @flights.first
    end
    @preview_points = panel ? [] : Flights::RoutePreview.call(@selected_entry)
  end

  def requested_folder
    value = params[:folder].presence
    return if value.nil?
    return value if value.is_a?(String) && (value == "unfiled" || value.match?(/\A[1-9][0-9]*\z/))

    raise ActiveRecord::RecordNotFound
  end

  def browser_return_parameters
    params.permit(:folder, :filter, :q, :visibility, :page).to_h
  end
end
