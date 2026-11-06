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
    assert_select "[name='flight[fdr_id]']", count: 0
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
    assert_select "a[href=?]", new_flight_import_path(flight_id: flight.id), text: /Import data/
    assert_select "a[href=?]", signal_path(flight_id: flight.id), text: /Start Signal/
    assert_select "a", text: /Run preflight/, count: 0
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

  test "Signal identifies a recorder from telemetry on a manual flight without aircraft" do
    flight = log_entry
    fdr = create_exofdr_assembly
    recorder = create_embedded_controller(assembly: fdr, device_id: "ECU-A12345")
    session = Signal::StartSession.new(user: @owner, flight_id: flight.id).call
    assert_nil session.flight.fdr
    post batches_api_v1_signal_session_path(session.uuid), params: { sequence: 0, samples: [
      { kind: "sensor", sensor_type: "IMU_QUALITY", recorded_at: Time.current.iso8601(6), readings: { deviceId: recorder.device_id } }
    ] }, as: :json
    assert_response :success
    assert_equal fdr, flight.reload.fdr
    assert_nil flight.aircraft
    assert_equal Date.new(2026, 10, 18), flight.flown_on
  end

  test "a flight with an aircraft offers import and live acquisition without selecting a recorder" do
    flight = log_entry(aircraft: aircraft(:pilatus))
    get flight_path(flight)
    assert_select "dd", text: aircraft(:pilatus).display_name
    assert_select "a[href=?]", new_flight_import_path(flight_id: flight.id), text: /Import data/
    assert_select "a[href=?]", signal_path(flight_id: flight.id), text: /Start Signal/
    assert_select "a", text: /Run preflight/, count: 0
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

  test "flight editing does not accept a manually selected recorder" do
    flight = log_entry(description: "Old name")
    get edit_flight_path(flight)
    assert_select "[name='flight[fdr_id]']", count: 0
    patch flight_path(flight), params: { flight: { fdr_id: create_exofdr_assembly.id, description: "" } }
    assert_response :redirect
    assert_equal "", flight.reload.description
    assert_nil flight.fdr
  end

  private

  def log_entry(**attributes)
    @owner.flights.create!({ status: "logged", flown_on: "2026-10-18", location: "Bouloc" }.merge(attributes))
  end
end
