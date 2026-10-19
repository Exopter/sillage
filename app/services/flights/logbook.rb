module Flights
  class Logbook
    FILTERS = %w[flights set_aside all].freeze
    PER_PAGE = 30

    def initialize(user:, filter:, query: nil, visibility: nil, folder: nil)
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
        .includes(:flight_import, :aircraft, :folder, :fdr).index_by(&:id)
      imports = @user.flight_imports.where(id: rows.select { |row| row["kind"] == "import" }.map { |row| row["id"] })
        .includes(:aircraft).index_by(&:id)
      rows.filter_map { |row| (row["kind"] == "flight" ? flights : imports)[row["id"]] }
    end

    private

    def flight_scope
      visible = Flight.visible_to(@user)
      scope = visible.where.not(flight_import_id: FlightImport.set_aside.select(:id))
        .or(visible.where(flight_import_id: nil))
      scope = scope.merge(Flight.with_effective_visibility(@visibility)) if @visibility
      if @folder
        if @folder == "unfiled"
          scope = scope.where(user_id: @user.id, folder_id: nil)
        else
          scope = scope.where(folder_id: FlightFolder.visible_to(@user).find(@folder).id)
        end
      end
      scope = scope.none if @filter == "set_aside"
      if @query.present?
        scope = scope.left_joins(:aircraft, :flight_import).where(
          "flights.name ILIKE :q OR EXISTS (SELECT 1 FROM flight_comments WHERE flight_comments.flight_id = flights.id AND flight_comments.body ILIKE :q) OR flights.code ILIKE :q OR flights.location ILIKE :q OR aircraft.registration ILIKE :q OR (flights.user_id = :user_id AND flight_imports.source_filename ILIKE :q)", q: pattern, user_id: @user.id)
      end
      scope.select("flights.id, 'flight' AS kind, COALESCE(flights.flown_on + COALESCE(flights.flown_at, '00:00'::time), flights.started_at) AS started_at, flights.created_at")
    end

    def import_scope
      scope = @user.flight_imports
      scope = scope.none if @folder
      scope = scope.none if @visibility.in?(%w[public shared])
      with_flights = @user.flights.where.not(flight_import_id: nil).select(:flight_import_id)
      scope = scope.where.not(id: with_flights).or(scope.set_aside)
      scope = scope.set_aside if @filter == "set_aside"
      scope = scope.where.not(id: @user.flight_imports.set_aside.select(:id)) if @filter == "flights"
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
