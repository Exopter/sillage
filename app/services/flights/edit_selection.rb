module Flights
  # Applies the same change to several flights. Only the fields that were given
  # are written: a pilot change never touches a date, a time or a folder.
  class EditSelection
    class Invalid < StandardError; end
    Result = Struct.new(:updated, :unchanged, :skipped)

    def initialize(user:, flight_ids:, changes:)
      @user, @flight_ids = user, flight_ids
      @changes = resolve(changes.to_h.symbolize_keys)
      raise Invalid, "Change at least one field." if @changes.empty?
    end

    def call
      result = Result.new(0, 0, [])
      Flight.visible_to(@user).where(id: @flight_ids).order(:id).find_each do |flight|
        flight.folder_assignment_user = @user
        flight.assign_attributes(@changes)
        if !flight.changed?
          result.unchanged += 1
        elsif flight.save
          flight.capture_configuration!(replace: true) if flight.saved_change_to_aircraft_id?
          result.updated += 1
        else
          result.skipped << "#{flight.label} (#{flight.errors.full_messages.to_sentence})"
        end
      end
      result
    end

    private

    # Blank means "keep as is". Each target is checked once, before any flight is written.
    def resolve(given)
      changes = {}
      changes[:pilot_id] = find(User.available_as_pilot, given[:pilot_id], "pilot").id if given[:pilot_id].present?
      if given[:aircraft_id].present?
        changes[:aircraft_id] = given[:aircraft_id] == "none" ? nil : find(Aircraft.active, given[:aircraft_id], "aircraft").id
      end
      if given[:folder_id].present?
        changes[:folder_id] = given[:folder_id] == "unfiled" ? nil : find(FlightFolder.contributable_to(@user), given[:folder_id], "folder").id
      end
      changes[:location] = given[:location].to_s.strip.first(200) if given[:location].to_s.strip.present?
      if given[:environment].present?
        raise Invalid, "Choose Tunnel or Sky." unless given[:environment].in?(Flight::ENVIRONMENTS)
        changes[:environment] = given[:environment]
      end
      if given[:flown_on].present?
        changes[:flown_on] = Date.iso8601(given[:flown_on].to_s)
      end
      changes
    rescue Date::Error
      raise Invalid, "Enter a valid date."
    end

    def find(scope, id, label)
      scope.find_by(id: id.to_s[/\A[1-9][0-9]*\z/]) || raise(Invalid, "Choose an available #{label}.")
    end
  end
end
