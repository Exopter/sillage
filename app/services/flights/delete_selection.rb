module Flights
  class DeleteSelection
    class InvalidSelection < StandardError; end

    def initialize(user:, entries:)
      @user = user
      unless entries.is_a?(Array) && entries.any? && entries.size <= Logbook::PER_PAGE &&
          entries.all? { |entry| entry.is_a?(String) && entry.match?(/\A(?:flight|import):[1-9][0-9]*\z/) }
        raise InvalidSelection, "Select between 1 and #{Logbook::PER_PAGE} entries on this page."
      end
      @entries = entries.uniq
    end

    def call
      Flight.transaction do
        # Resolve the entire selection under the owner before deleting anything.
        imports = @user.flight_imports.find(ids_for("import")).sort_by(&:id)
        flights = @user.flights.find(ids_for("flight")).sort_by(&:id)
        covered_flights = imports.flat_map { |entry| entry.flights.pluck(:id) }
        imports.each { |entry| DeleteRecording.new(flight_import: entry).call }
        flights.reject { |flight| covered_flights.include?(flight.id) }.each do |flight|
          DeleteRecording.new(flight:).call
        end
      end
      @entries.size
    end

    private

    def ids_for(kind)
      @entries.filter_map { |entry| entry.delete_prefix("#{kind}:") if entry.start_with?("#{kind}:") }
    end
  end
end
