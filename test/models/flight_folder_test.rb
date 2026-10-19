require "test_helper"

class FlightFolderTest < ActiveSupport::TestCase
  test "names are trimmed required bounded and unique per owner ignoring case" do
    folder = users(:julien).flight_folders.create!(name: "  Flight tests  ")
    assert_equal "Flight tests", folder.name
    [ "", "   ", "a" * 101, "FLIGHT TESTS" ].each do |name|
      assert_not users(:julien).flight_folders.new(name: name).valid?
    end
    assert users(:operator).flight_folders.new(name: folder.name).valid?
  end

  test "a flight cannot use another owner's private folder" do
    flight = flights(:one)
    folder = users(:operator).flight_folders.create!(name: "Other owner")
    assert_not flight.update(folder: folder)
    assert_includes flight.errors[:folder], "must allow the person moving the flight to contribute"
    assert_not flight.update(folder_id: 999_999_999)
    assert_nil flight.reload.folder_id
  end

  test "deleting a folder keeps its flights recordings samples and visibility" do
    folder = users(:julien).flight_folders.create!(name: "Archived campaign")
    flight = flights(:one)
    flight.update!(folder: folder, visibility: "team")
    assert_no_difference [ "Flight.count", "FlightImport.count", "TrackPoint.count", "SensorSample.count" ] do
      folder.destroy!
    end
    assert_nil flight.reload.folder_id
    assert_equal "team", flight.visibility
  end

  test "database deletion also safely unfiles flights" do
    folder = users(:julien).flight_folders.create!(name: "Campaign")
    flights(:one).update!(folder: folder)
    folder.delete
    assert_nil flights(:one).reload.folder_id
  end
end
