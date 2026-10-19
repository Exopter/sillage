module Flights
  class MoveSelection
    class InvalidSelection < StandardError; end

    def initialize(user:, entries:, folder_id:)
      @user, @folder_id = user, folder_id
      unless entries.is_a?(Array) && entries.any? && entries.size <= Logbook::PER_PAGE &&
          entries.all? { |entry| entry.is_a?(String) && entry.match?(/\Aflight:[1-9][0-9]*\z/) }
        raise InvalidSelection, "Select between 1 and #{Logbook::PER_PAGE} accessible flights. Recordings cannot be moved to folders."
      end
      unless folder_id.is_a?(String) && (folder_id == "unfiled" || folder_id.match?(/\A[1-9][0-9]*\z/))
        raise InvalidSelection, "Choose a destination folder or Unfiled."
      end
      @ids = entries.uniq.map { |entry| entry.delete_prefix("flight:") }
    end

    def call
      Flight.transaction do
        folder = FlightFolder.contributable_to(@user).lock.find(@folder_id) unless @folder_id == "unfiled"
        # Keep ownership; effective visibility follows the destination folder.
        flights = Flight.visible_to(@user).order(:id).lock.find(@ids)
        Flight.where(id: flights.map(&:id)).update_all(folder_id: folder&.id, updated_at: Time.current)
      end
    end
  end
end
