module Flights
  class Logbook
    FILTERS = %w[flights set_aside all].freeze
    PER_PAGE = 30

    def initialize(user:, filter:, query: nil)
      @user, @filter, @query = user, filter, query.to_s.strip
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
      flights = @user.flights.where(id: rows.select { |row| row["kind"] == "flight" }.map { |row| row["id"] })
        .includes(:flight_import, :aircraft).index_by(&:id)
      imports = @user.flight_imports.where(id: rows.select { |row| row["kind"] == "import" }.map { |row| row["id"] })
        .includes(:aircraft).index_by(&:id)
      rows.filter_map { |row| (row["kind"] == "flight" ? flights : imports)[row["id"]] }
    end

    private

    def flight_scope
      scope = @user.flights.where.not(flight_import_id: @user.flight_imports.set_aside.select(:id))
        .or(@user.flights.where(flight_import_id: nil))
      scope = scope.none if @filter == "set_aside"
      if @query.present?
        scope = scope.left_joins(:aircraft, :flight_import).where(
          "flights.name ILIKE :q OR flights.code ILIKE :q OR flights.location ILIKE :q OR aircraft.registration ILIKE :q OR flight_imports.source_filename ILIKE :q", q: pattern)
      end
      scope.select("flights.id, 'flight' AS kind, flights.started_at, flights.created_at")
    end

    def import_scope
      scope = @user.flight_imports
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
