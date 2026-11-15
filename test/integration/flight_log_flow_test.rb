require "test_helper"

class FlightLogFlowTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @owner = users(:julien)
    sign_in_as @owner
  end

  test "new flight offers preparation and logging with browser context" do
    get flights_path, params: { q: "Bouloc" }
    assert_select ".exds-browser-create summary", text: /New flight/
    assert_select ".exds-browser-create-options a[href=?]", new_flight_path(q: "Bouloc", intent: "prepare"), text: "Prepare a flight"
    assert_select ".exds-browser-create-options a[href=?]", new_flight_path(q: "Bouloc", intent: "log"), text: "Log a flight"
  end

  test "preparation accepts incomplete details and stays in preparation when edited" do
    get new_flight_path(intent: "prepare")
    assert_response :success
    assert_select "#flight-panel-title", text: "Prepare a flight"
    assert_select "input[name=intent][value=prepare]"
    assert_select "input[name='flight[flown_on]'][required], input[name='flight[location]'][required]", count: 0
    assert_select "input[name='flight[flown_on]'][value]", count: 0
    assert_select "input[name='flight[flown_at]'][data-controller=local-time]", count: 0
    assert_select "input[type=submit][value='Create flight']"

    assert_difference "Flight.count" do
      post flights_path, params: { intent: "prepare", flight: { description: "Upcoming flight" } }
    end
    flight = @owner.flights.order(:id).last
    assert flight.preparation?
    assert_nil flight.flown_on
    assert_nil flight.flown_at
    assert_nil flight.location

    patch flight_path(flight), params: { intent: "prepare", flight: { location: "", flown_on: "" } }
    assert_response :redirect
    assert flight.reload.preparation?
    assert_nil flight.flown_on
    get flight_path(flight)
    assert_select "a[href=?]", edit_flight_path(flight, intent: "log"), text: "Log flight"
  end

  test "logging requires date and location and keeps the local time default" do
    get new_flight_path(intent: "log")
    assert_select "#flight-panel-title", text: "Log a flight"
    assert_select "input[name=intent][value=log]"
    assert_select "input[name='flight[flown_on]'][required]"
    assert_select "input[name='flight[location]'][required]"
    assert_select "input[name='flight[flown_at]'][data-controller=local-time]"
    assert_select "input[type=submit][value='Log flight']"

    post flights_path, params: { intent: "log", flight: { description: "Missing details", flown_at: "14:35" } }
    assert_response :unprocessable_entity
    assert_select "input[name=intent][value=log]"
    assert_select "input[name='flight[flown_at]']" do |inputs|
      assert_match(/\A14:35(?::00(?:\.0+)?)?\z/, inputs.first["value"])
    end
    assert_select "input[name='flight[flown_at]'][data-controller=local-time]", count: 0
  end

  test "preparation can be logged only after required details are supplied" do
    flight = @owner.flights.create!(status: "preparation", description: "Upcoming flight")
    get edit_flight_path(flight, intent: "log")
    assert_select "#flight-panel-title", text: "Log a flight"
    assert_select "input[name=intent][value=log]"
    assert_select "input[name='flight[flown_on]'][required]"
    assert_select "input[type=submit][value='Log flight']"

    patch flight_path(flight), params: { intent: "log", return_to_browser: "1", flight: { flown_on: "", location: "" } }
    assert_response :unprocessable_entity
    assert flight.reload.preparation?
    assert_select "input[name=intent][value=log]"

    patch flight_path(flight), params: { intent: "log", flight: { flown_on: "2026-11-15", location: "Bouloc", flown_at: "14:35" } }
    assert_response :redirect
    assert flight.reload.logged?
    assert_equal Date.new(2026, 11, 15), flight.flown_on
    assert_equal "14:35", flight.flown_at.strftime("%H:%M")
  end

  test "preparation validation preserves intent and entered details" do
    post flights_path, params: { intent: "prepare", flight: { flown_at: "invalid", description: "Upcoming flight" } }
    assert_response :unprocessable_entity
    assert_select "#flight-panel-title", text: "Prepare a flight"
    assert_select "input[name=intent][value=prepare]"
    assert_select "input[name='flight[description]'][value='Upcoming flight']"
    assert_select "input[name='flight[location]'][required]", count: 0
  end

  test "location suggestions reuse visible flight locations without exposing private flights" do
    first = log_entry(location: "Bouloc")
    log_entry(location: "Bouloc")
    log_entry(location: "  Bouloc  ")
    users(:operator).flights.create!(status: "preparation", location: "Private airfield")
    users(:operator).flights.create!(status: "preparation", location: "Shared airfield", visibility: "team")

    [ new_flight_path, edit_flight_path(first) ].each do |path|
      get path
      assert_response :success
      assert_select "input[name='flight[location]'][role='combobox'][aria-controls='flight-location-suggestions'][aria-describedby='flight-location-help']"
      assert_select "#flight-location-suggestions button[role=option]", text: "Bouloc", count: 1
      assert_select "#flight-location-suggestions button[role=option]", text: "Shared airfield"
      assert_select "#flight-location-suggestions button[role=option]", text: "Private airfield", count: 0
    end

    post flights_path, params: { flight: { location: "New drop zone" } }
    assert_response :unprocessable_entity
    assert_select "input[name='flight[location]'][value='New drop zone']"
    assert_select "#flight-location-suggestions button[role=option]", text: "Bouloc"

    assert_difference "Flight.count" do
      post flights_path, params: { flight: { flown_on: "2026-11-15", location: "New drop zone" } }
    end
    assert_equal "New drop zone", @owner.flights.order(:id).last.location
  end

  test "date and location alone create a complete log entry" do
    get new_flight_path
    assert_select "input[name='flight[flown_on]'][required]"
    assert_select "input[name='flight[location]'][required]"
    assert_select "input[name='flight[name]']", count: 0
    assert_select "select[name='flight[aircraft_id]'][required]", count: 0
    assert_select "select[name='flight[fdr_id]'][required]", count: 0
    assert_difference "Flight.count" do
      post flights_path, params: { flight: { flown_on: "2025-06-15", location: "Bouloc" } }
    end
    flight = @owner.flights.order(:created_at).last
    assert flight.logged?
    assert_match(/\AFLT-2025-/, flight.code)
    assert_nil flight.aircraft
    assert_nil flight.fdr
    assert_nil flight.description
    assert_nil flight.started_at
    assert_nil flight.flown_at
    follow_redirect!
    assert_select "#flight-panel-title", flight.code
    assert_select "textarea[name='flight_comment[body]']"
    assert_select "a", text: /Start Signal|Import data|Run preflight/, count: 0
    assert_select ".exds-browser-map", count: 0
    assert_not_includes response.body, "Preparation"
    assert_not_includes response.body, "No recorded route"
  end

  test "date and location are both required and validation retains the initial comment" do
    [ { location: "Bouloc" }, { flown_on: "2026-10-18", location: "  " }, { flown_on: "invalid", location: "Bouloc" } ].each do |attributes|
      assert_no_difference "Flight.count" do
        post flights_path, params: { flight: attributes.merge(initial_comment: "Keep this observation") }
      end
      assert_response :unprocessable_entity
      assert_select "textarea[name='flight[initial_comment]']", text: "Keep this observation"
    end
  end

  test "an FDR enables acquisition independently of an aircraft and can be linked later" do
    flight = log_entry
    fdr = create_exofdr_assembly
    patch flight_path(flight), params: { flight: { fdr_id: fdr.id } }
    assert_equal fdr, flight.reload.fdr
    assert_nil flight.aircraft
    get flight_path(flight)
    assert_select "a[href=?]", new_flight_import_path(flight_id: flight.id)
    assert_select "a[href=?]", signal_path(flight_id: flight.id)
    session = Signal::StartSession.new(user: @owner, flight_id: flight.id).call
    assert_equal flight, session.flight
    assert_equal Date.new(2026, 10, 18), flight.reload.flown_on
  end

  test "aircraft alone does not enable recording controls" do
    flight = log_entry(aircraft: aircraft(:pilatus))
    get flight_path(flight)
    assert_select "dd", text: aircraft(:pilatus).display_name
    assert_select "a", text: /Start Signal|Import data|Run preflight/, count: 0
    assert_raises Signal::StartSession::InvalidFlight do
      Signal::StartSession.new(user: @owner, flight_id: flight.id).call
    end
    assert_no_difference "FlightImport.count" do
      post flight_imports_path, params: { flight_import: { target_flight_id: flight.id, import_type: "flysight",
        source_files: [ fixture_file_upload("flysight_v2/TRACK.CSV", "text/csv") ] } }, as: :html
    end
  end

  test "a recording preserves log metadata and optional aircraft" do
    fdr = create_exofdr_assembly
    flight = log_entry(fdr:, description: "Canopy test", initial_comment: "Keep my observation", flown_at: "14:35")
    comment = flight.comments.sole
    code = flight.code
    post flight_imports_path, params: { flight_import: { target_flight_id: flight.id, import_type: "flysight",
      source_files: [ fixture_file_upload("flysight_v2/TRACK.CSV", "text/csv"), fixture_file_upload("flysight_v2/SENSOR.CSV", "text/csv") ] } }
    assert_response :redirect
    perform_enqueued_jobs only: FlySightImportJob
    flight.reload
    assert flight.analysed?
    assert_equal code, flight.code
    assert_equal "Canopy test", flight.description
    assert_equal comment, flight.comments.sole
    assert_equal "Keep my observation", comment.reload.body
    assert_equal "Bouloc", flight.location
    assert_equal Date.new(2026, 10, 18), flight.flown_on
    assert_equal "14:35", flight.flown_at.strftime("%H:%M")
    assert_nil flight.aircraft
    assert_equal fdr, flight.fdr
    assert flight.track_points.exists?
    assert flight.started_at
  end

  test "log entries are ordered by flight date rather than entry creation date" do
    older = log_entry(flown_on: "2024-01-01")
    newer = log_entry(flown_on: "2025-01-01")
    older.update_columns(created_at: 1.day.from_now)
    results = Flights::Logbook.new(user: @owner, filter: "flights").page(1)
    assert_operator results.index(newer), :<, results.index(older)
  end

  test "generic assemblies cannot be linked as an FDR and descriptions can be cleared" do
    flight = log_entry(description: "Old name")
    generic = Assembly.create!(name: "Generic equipment")
    patch flight_path(flight), params: { flight: { fdr_id: generic.id } }, as: :json
    assert_response :unprocessable_entity
    assert_nil flight.reload.fdr
    patch flight_path(flight), params: { flight: { description: "" } }
    assert_response :redirect
    assert_equal "", flight.reload.description
  end

  private

  def log_entry(**attributes)
    @owner.flights.create!({ status: "logged", flown_on: "2026-10-18", location: "Bouloc" }.merge(attributes))
  end
end
