require "test_helper"

class FlightBulkEditFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:julien)
    sign_in_as @owner
    @folder = FlightFolder.create!(user: @owner, name: "Tunnel campaign")
    @flights = 32.times.map do |index|
      @owner.flights.create!(status: "review", started_at: Time.utc(2026, 11, 16, 9, index), location: "Tunnel", folder: @folder)
    end
  end

  test "the list offers Edit and extends a page selection to every flight of the list" do
    get flights_path(folder: @folder.id)
    assert_select "form[data-controller='table-selection'][data-table-selection-total-value='32']" do
      assert_select "input[type=hidden][name=scope][value=page]", count: 1
      assert_select ".exds-browser-collection-header input[data-table-selection-target='all']", count: 1
      assert_select ".exds-selection-toolbar input[data-table-selection-target='all']", count: 0
      assert_select "button[formaction='#{bulk_edit_flights_path}'][formmethod=get]", text: "Edit"
      assert_select "[data-table-selection-target='extend'][hidden] button[data-action='table-selection#selectAll']", count: 1
    end
  end

  test "editing a page selection changes only the given field" do
    pilot = users(:operator)
    chosen = @flights.last(2)
    get bulk_edit_flights_path(folder: @folder.id, scope: "page", entries: chosen.map { |flight| "flight:#{flight.id}" })
    assert_response :success
    assert_select "#flight-panel-title", "Edit 2 flights"
    assert_select "form[action='#{bulk_update_flights_path}']" do
      assert_select "input[name='entries[]']", count: 2
      assert_select "select[name='changes[pilot_id]'] option[selected]", count: 0
      assert_select "small", text: /Same on all: Tunnel/
    end
    assert_select ".exds-browser-entry input[name='entries[]'][checked]", count: 2

    post bulk_update_flights_path, params: { folder: @folder.id, scope: "page", entries: chosen.map { |flight| "flight:#{flight.id}" }, changes: { pilot_id: pilot.id, location: "", flown_on: "", folder_id: "", aircraft_id: "" } }
    assert_redirected_to flights_path(filter: "flights", folder: @folder.id)
    assert_equal "2 flights updated.", flash[:notice]
    chosen.each do |flight|
      flight.reload
      assert_equal pilot, flight.pilot
      assert_nil flight.flown_on
      assert_equal "Tunnel", flight.location
      assert_equal @folder, flight.folder
    end
    assert_equal @owner, @flights.first.reload.pilot
  end

  test "editing the whole list reaches flights on every page and reports unchanged ones" do
    @flights.first.update!(location: "Inclined Slovenia")
    outside = @owner.flights.create!(status: "review", started_at: Time.utc(2026, 11, 15, 9), location: "Elsewhere")
    get bulk_edit_flights_path(folder: @folder.id, scope: "all")
    assert_select "#flight-panel-title", "Edit 32 flights"
    assert_select "small", text: /Now: 2 different locations/
    assert_select "form[action='#{bulk_update_flights_path}'] input[name=scope][value=all]", count: 1

    post bulk_update_flights_path, params: { folder: @folder.id, scope: "all", changes: { location: "Inclined Slovenia" } }
    assert_equal "31 flights updated. 1 already matched.", flash[:notice]
    assert_equal [ "Inclined Slovenia" ], @folder.flights.distinct.pluck(:location)
    assert_equal "Elsewhere", outside.reload.location
  end

  test "an empty change, a recording or another user's private flight is refused" do
    post bulk_update_flights_path, params: { scope: "page", entries: [ "flight:#{@flights.first.id}" ], changes: { pilot_id: "" } }
    assert_equal "Change at least one field.", flash[:alert]
    get bulk_edit_flights_path(scope: "page", entries: [ "import:1" ])
    assert_match(/Recordings cannot be edited together/, flash[:alert])
    private_flight = users(:operator).flights.create!(status: "review", started_at: Time.utc(2026, 11, 16, 12), location: "Private")
    post bulk_update_flights_path, params: { scope: "page", entries: [ "flight:#{private_flight.id}" ], changes: { location: "Changed" } }
    assert_equal "The selected flights are no longer available.", flash[:alert]
    assert_equal "Private", private_flight.reload.location
    post bulk_update_flights_path, params: { scope: "page", entries: [ "flight:#{@flights.first.id}" ], changes: { pilot_id: User.maximum(:id) + 1 } }
    assert_equal "Choose an available pilot.", flash[:alert]
  end
end
