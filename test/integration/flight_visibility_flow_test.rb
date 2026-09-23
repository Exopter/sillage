require "test_helper"

class FlightVisibilityFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:julien)
    @other = users(:operator)
    @private = flights(:one)
    @shared = @other.flights.create!(name: "Team mission", visibility: "team", aircraft: aircraft(:pilatus))
    @hidden = @other.flights.create!(name: "Confidential mission", aircraft: aircraft(:pilatus))
    sign_in_as @owner
  end

  test "logbook filters and search include team flights without exposing another owner's private data" do
    get flights_path
    assert_response :success
    assert_select "a.flights-code[href=?]", flight_path(@private)
    assert_select "a.flights-code[href=?]", flight_path(@shared)
    assert_select "a.flights-code[href=?]", flight_path(@hidden), count: 0
    assert_select "input[name='entries[]'][value=?]", "flight:#{@shared.id}", count: 0
    assert_select "input[name='entries[]'][value=?]", "flight:#{@private.id}", count: 1
    assert_includes response.headers["Cache-Control"], "no-store"

    get flights_path(visibility: "private")
    assert_select "a.flights-code[href=?]", flight_path(@private)
    assert_select "a.flights-code[href=?]", flight_path(@shared), count: 0
    assert_select "a.flights-code[href=?]", flight_path(@hidden), count: 0

    get flights_path(visibility: "team", q: "mission")
    assert_select "a.flights-code", count: 1
    assert_select "a.flights-code[href=?]", flight_path(@shared)
    assert_select "input[name='visibility'][value='team']"

    get flights_path(q: "Confidential")
    assert_select "a.flights-code", count: 0
  end

  test "private flights are inaccessible even to another administrator" do
    get flight_path(@hidden)
    assert_response :not_found
    get edit_flight_path(@hidden)
    assert_response :not_found
    patch flight_path(@hidden), params: { flight: { visibility: "team" } }
    assert_response :not_found
    delete flight_path(@hidden)
    assert_response :not_found
    assert_equal "private", @hidden.reload.visibility
  end

  test "team preparation and replay are readable without modification controls" do
    @shared.update!(status: "preparation", notes: "Shared flight notes")
    get flight_path(@shared)
    assert_response :success
    assert_select "a[href=?]", edit_flight_path(@shared), count: 0
    assert_select "a[href=?]", new_flight_import_path(flight_id: @shared.id), count: 0
    assert_includes response.body, "Shared flight notes"

    @shared.update!(status: "analysed")
    get flight_path(@shared)
    assert_response :success
    assert_select "[data-controller='flight-viewer']"
    assert_select "form[action=?]", flight_path(@shared), count: 0
    assert_select ".mode-badge", text: "Team"
    assert_includes response.body, "Shared flight notes"
    assert_select "meta[name='turbo-cache-control'][content='no-cache']"
  end

  test "team access cannot edit delete change owner or attach recordings" do
    get edit_flight_path(@shared)
    assert_response :not_found
    patch flight_path(@shared), params: { flight: { visibility: "private", user_id: @owner.id, name: "Changed" } }
    assert_response :not_found
    delete flight_path(@shared)
    assert_response :not_found
    assert_equal "Team mission", @shared.reload.name
    assert_equal @other.id, @shared.user_id

    assert_no_difference [ "Flight.count", "FlightImport.count" ] do
      delete bulk_destroy_flights_path, params: { entries: [ "flight:#{@private.id}", "flight:#{@shared.id}" ] }
      assert_response :not_found
    end
    assert_raises(ActiveRecord::RecordNotFound) do
      Signal::StartSession.new(user: @owner, flight_id: @shared.id).call
    end
  end

  test "owner can share and revoke access immediately without transferring ownership" do
    patch flight_path(@private), params: { flight: { visibility: "team", user_id: @other.id } }
    assert_redirected_to flight_path(@private)
    assert_equal "team", @private.reload.visibility
    assert_equal @owner.id, @private.user_id
    sign_in_as @other
    get flight_path(@private)
    assert_response :success
    assert_select "a[href=?]", flight_import_path(@private.flight_import), count: 0
    get flight_import_path(@private.flight_import)
    assert_response :not_found

    sign_in_as @owner
    patch flight_path(@private), params: { flight: { visibility: "private" } }
    assert_redirected_to flight_path(@private)
    sign_in_as @other
    get flight_path(@private)
    assert_response :not_found
    get flights_path
    assert_select "a.flights-code[href=?]", flight_path(@private), count: 0
  end

  test "creation defaults to private and accepts only the two supported visibility values" do
    get new_flight_path
    assert_select "select[name='flight[visibility]'] option[selected][value='private']"
    [ nil, "team" ].each do |visibility|
      attributes = { name: "Prepared mission", aircraft_id: aircraft(:pilatus).id }
      attributes[:visibility] = visibility if visibility
      assert_difference "Flight.count", 1 do
        post flights_path, params: { flight: attributes }
      end
      assert_equal visibility || "private", @owner.flights.order(:id).last.visibility
    end
    assert_no_difference "Flight.count" do
      post flights_path, params: { flight: { name: "Bad visibility", aircraft_id: aircraft(:pilatus).id, visibility: "public" } }
      assert_response :unprocessable_entity
    end
    patch flight_path(@private), params: { flight: { visibility: "public" } }, as: :json
    assert_response :unprocessable_entity
    assert_equal "private", @private.reload.visibility
  end

  test "team visibility never exposes unshared raw recordings" do
    recording = @owner.flight_imports.create!(source_filename: "Private source", import_type: "exofdr", status: "pending")
    get flights_path(filter: "all", visibility: "team")
    assert_select "a.flights-code[href=?]", flight_import_path(recording), count: 0
    get flights_path(filter: "all", visibility: "private")
    assert_select "a.flights-code[href=?]", flight_import_path(recording)

    source = @other.flight_imports.create!(source_filename: "Unshared source filename", import_type: "flysight", status: "imported")
    @shared.update!(flight_import: source)
    get flights_path(q: "Unshared source filename")
    assert_select "a.flights-code", count: 0
    sign_in_as @other
    get flights_path(q: "Unshared source filename")
    assert_select "a.flights-code[href=?]", flight_path(@shared)
  end

  test "team pagination retains visibility query and status filter" do
    31.times { |index| @other.flights.create!(name: "Review #{index}", visibility: "team") }
    get flights_path(visibility: "team", filter: "all", q: "Review")
    assert_select "tbody tr", count: 30
    assert_select "a[rel='next'][href*='visibility=team'][href*='filter=all'][href*='q=Review']"
    get flights_path(visibility: "team", filter: "all", q: "Review", page: 2)
    assert_select "tbody tr", count: 1
    assert_select "a[rel='next']", count: 0
  end

  test "bulk deletion returns to the selected visibility" do
    delete bulk_destroy_flights_path, params: { entries: [ "flight:#{@private.id}" ], visibility: "private" }
    assert_redirected_to flights_path(filter: "flights", visibility: "private")
  end

  test "Hangar usage counts only flights visible to the signed in user" do
    get hangar_path(aircraft_id: aircraft(:pilatus).id)
    assert_response :success
    assert_select "strong", text: "2 test flights"
  end

  test "team flights still require authentication and active accounts" do
    delete logout_path
    get flight_path(@shared)
    assert_redirected_to new_session_path
    sign_in_as @owner
    @owner.update!(disabled_at: Time.current)
    get flight_path(@shared)
    assert_redirected_to new_session_path
  end
end
