module Flights
  class Logbook
    # "mine" keeps the flights piloted by the user; recordings have no pilot.
    FILTERS = %w[flights set_aside all mine].freeze
    PER_PAGE = 30

    def initialize(user:, filter:, query: nil, visibility: nil, folder: nil, environment: nil)
      @environment = environment.presence_in(Flight::ENVIRONMENTS)
      @user, @filter, @query = user, filter, query.to_s.strip
      @visibility = (visibility == "team" ? "public" : visibility).presence_in(Flight::EFFECTIVE_VISIBILITIES)
      @folder = folder.presence
    end

    def page(number)
      # One ordered page across flights and retained sources, without loading
      # the recording history or duplicating imports that already have flights.
      entries = Arel::Table.new(:entries)
      union = Arel::Nodes::UnionAll.new(flight_scope.arel, import_scope.arel)
      query = entries.project(Arel.star).from(Arel::Nodes::TableAlias.new(union, entries.name))
        .order(entries[:started_at].desc.nulls_last, entries[:created_at].desc, entries[:kind].asc, entries[:id].desc)
        .take(PER_PAGE + 1).skip(([ number.to_i, 1 ].max - 1) * PER_PAGE)
      rows = ApplicationRecord.connection.select_all(query)
      flights = Flight.visible_to(@user).where(id: rows.select { |row| row["kind"] == "flight" }.map { |row| row["id"] })
        .includes(:flight_import, :aircraft, :fdr, pilot: :avatar_attachment, folder: :memberships).index_by(&:id)
      resolve_recording_expectations(flights.values)
      resolve_debrief_expectations(flights.values)
      imports = FlightImport.accessible_to(@user).where(id: rows.select { |row| row["kind"] == "import" }.map { |row| row["id"] })
        .includes(:aircraft).index_by(&:id)
      rows.filter_map { |row| (row["kind"] == "flight" ? flights : imports)[row["id"]] }
    end

    # Entries across every page, so the browser can state how many pages exist.
    def count
      flight_scope.unscope(:select).count + import_scope.unscope(:select).count
    end

    # Flights of the whole list, across pages: what "select all" acts on. Recordings are not included.
    def flight_ids(limit: nil)
      flight_scope.unscope(:select).limit(limit).pluck("flights.id")
    end

    def flight_count
      flight_scope.unscope(:select).count
    end

    private

    # Two queries for the page instead of two per waiting flight.
    def resolve_recording_expectations(flights)
      waiting = flights.select(&:waiting_for_recording?)
      unlinked = waiting.reject { |flight| flight.fdr_id || flight.flight_import_id }.map(&:id)
      capturing = unlinked.empty? ? [] :
        SignalSession.where(flight_id: unlinked).distinct.pluck(:flight_id) | ImuCheck.where(flight_id: unlinked).distinct.pluck(:flight_id)
      waiting.each { |flight| flight.recording_expected = !unlinked.include?(flight.id) || capturing.include?(flight.id) }
    end

    # One query for the page instead of one per flight flown from the remote.
    def resolve_debrief_expectations(flights)
      remote = flights.select(&:remote_start_requested_at)
      return if remote.empty?

      debriefed = FlightDebrief.where(flight_id: remote.map(&:id)).where.not(status: "recording").distinct.pluck(:flight_id).to_set
      remote.each { |flight| flight.debrief_expected = !debriefed.include?(flight.id) }
    end

    def flight_scope
      visible = Flight.visible_to(@user)
      scope = visible.where.not(flight_import_id: FlightImport.set_aside.select(:id))
        .or(visible.where(flight_import_id: nil))
      scope = scope.merge(Flight.with_effective_visibility(@visibility)) if @visibility
      if @folder
        if @folder == "unfiled"
          scope = scope.where(folder_id: nil)
        else
          scope = scope.where(folder_id: FlightFolder.visible_to(@user).find(@folder).id)
        end
      end
      scope = scope.none if @filter == "set_aside"
      scope = scope.where(pilot_id: @user.id) if @filter == "mine"
      scope = scope.where(environment: @environment) if @environment
      if @query.present?
        scope = scope.left_joins(:aircraft, :flight_import).where(
          "flights.name ILIKE :q OR EXISTS (SELECT 1 FROM flight_comments WHERE flight_comments.flight_id = flights.id AND flight_comments.body ILIKE :q) OR flights.code ILIKE :q OR flights.location ILIKE :q OR aircraft.registration ILIKE :q OR (flight_imports.id IN (:import_ids) AND flight_imports.source_filename ILIKE :q)", q: pattern, import_ids: FlightImport.accessible_to(@user).select(:id))
      end
      scope.select("flights.id, 'flight' AS kind, COALESCE(flights.flown_on + flights.flown_at, CASE WHEN flights.flown_on IS NULL OR abs(flights.started_at::date - flights.flown_on) <= 1 THEN flights.started_at END, flights.flown_on::timestamp, flights.started_at) AS started_at, flights.created_at")
    end

    def import_scope
      scope = FlightImport.accessible_to(@user)
      scope = scope.none if @folder || @filter == "mine"
      scope = scope.none if @visibility.in?(%w[public shared])
      # A recording without a flight has no mode yet.
      scope = scope.none if @environment
      with_flights = Flight.where.not(flight_import_id: nil).select(:flight_import_id)
      scope = scope.where.not(id: with_flights).or(scope.set_aside)
      scope = scope.set_aside if @filter == "set_aside"
      scope = scope.where.not(id: FlightImport.accessible_to(@user).set_aside.select(:id)) if @filter == "flights"
      if @query.present?
        scope = scope.left_joins(:aircraft).where(
          "flight_imports.source_filename ILIKE :q OR flight_imports.device_id ILIKE :q OR aircraft.registration ILIKE :q", q: pattern)
      end
      scope.select("flight_imports.id, 'import' AS kind, flight_imports.log_started_at AS started_at, flight_imports.created_at")
    end

    def pattern
      "%#{Flight.sanitize_sql_like(@query)}%"
    end
  end
end
