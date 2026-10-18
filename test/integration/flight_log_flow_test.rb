require "test_helper"

class FlightLogFlowTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @owner = users(:julien)
    sign_in_as @owner
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
    assert_select "textarea[name='flight[notes]']"
    assert_select "a", text: /Start Signal|Import data|Run preflight/, count: 0
    assert_select ".exds-browser-map", count: 0
    assert_not_includes response.body, "Preparation"
    assert_not_includes response.body, "No recorded route"
  end

  test "date and location are both required and validation retains entered notes" do
    [ { location: "Bouloc" }, { flown_on: "2026-10-18", location: "  " }, { flown_on: "invalid", location: "Bouloc" } ].each do |attributes|
      assert_no_difference "Flight.count" do
        post flights_path, params: { flight: attributes.merge(notes: "Keep this observation") }
      end
      assert_response :unprocessable_entity
      assert_select "textarea[name='flight[notes]']", text: "Keep this observation"
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
    flight = log_entry(fdr:, description: "Canopy test", notes: "Keep my notes", flown_at: "14:35")
    code = flight.code
    post flight_imports_path, params: { flight_import: { target_flight_id: flight.id, import_type: "flysight",
      source_files: [ fixture_file_upload("flysight_v2/TRACK.CSV", "text/csv"), fixture_file_upload("flysight_v2/SENSOR.CSV", "text/csv") ] } }
    assert_response :redirect
    perform_enqueued_jobs only: FlySightImportJob
    flight.reload
    assert flight.analysed?
    assert_equal code, flight.code
    assert_equal "Canopy test", flight.description
    assert_equal "Keep my notes", flight.notes
    assert_equal "Bouloc", flight.location
    assert_equal Date.new(2026, 10, 18), flight.flown_on
    assert_equal "14:35", flight.flown_at.strftime("%H:%M")
    assert_nil flight.aircraft
    assert_equal fdr, flight.fdr
    assert flight.track_points.exists?
    assert flight.started_at
  end

  test "notes are editable by the owner searchable and never writable by another viewer" do
    flight = log_entry(visibility: "team")
    patch flight_path(flight), params: { return_to_browser: "1", flight: { notes: "Stable opening\nRepeat test" } }
    assert_redirected_to flights_path(selected: "flight:#{flight.id}")
    get flights_path(q: "Stable opening")
    assert_select ".exds-browser-entry-copy strong", text: flight.code
    sign_in_as users(:operator)
    get preview_flights_path(id: flight.id, kind: "flight")
    assert_response :success
    assert_select "p", text: /Stable opening/
    assert_select "textarea", count: 0
    patch flight_path(flight), params: { flight: { notes: "Changed" } }
    assert_response :not_found
    assert_equal "Stable opening\nRepeat test", flight.reload.notes
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
