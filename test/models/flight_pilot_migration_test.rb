require "test_helper"
require Rails.root.join("db/migrate/20261115150000_add_pilot_to_flights")

class FlightPilotMigrationTest < ActiveSupport::TestCase
  test "legacy flights retain their context and receive their creator as pilot" do
    flights(:two).update!(user: users(:operator))
    expected = Flight.order(:id).map { |flight| flight.attributes.except("pilot_id") }
    migration = AddPilotToFlights.new

    migration.suppress_messages do
      migration.down
      migration.up
    end
    Flight.reset_column_information

    assert_equal expected, Flight.order(:id).map { |flight| flight.attributes.except("pilot_id") }
    assert Flight.all.all? { |flight| flight.pilot_id == flight.user_id }
    assert_not Flight.columns_hash.fetch("pilot_id").null
  ensure
    Flight.reset_column_information
  end
end
