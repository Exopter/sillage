module Flights
  # Resolves what a selection toolbar submitted into flight ids: the ticked
  # entries of one page, or every flight matching the list across its pages.
  class Selection
    class Invalid < StandardError; end
    MAX = 500

    def self.flight_ids(user:, scope:, entries:, filter:, query:, visibility:, folder:)
      if scope == "all"
        ids = Logbook.new(user:, filter:, query:, visibility:, folder:).flight_ids(limit: MAX + 1)
        raise Invalid, "Narrow the list to #{MAX} flights or fewer to edit them together." if ids.size > MAX
        raise Invalid, "No flights match this list." if ids.empty?
        return ids
      end

      unless entries.is_a?(Array) && entries.any? && entries.size <= Logbook::PER_PAGE &&
          entries.all? { |entry| entry.is_a?(String) && entry.match?(/\Aflight:[1-9][0-9]*\z/) }
        raise Invalid, "Select between 1 and #{Logbook::PER_PAGE} flights. Recordings cannot be edited together."
      end
      ids = Flight.visible_to(user).where(id: entries.uniq.map { |entry| entry.delete_prefix("flight:") }).order(:id).pluck(:id)
      raise Invalid, "The selected flights are no longer available." if ids.empty?
      ids
    end
  end
end
