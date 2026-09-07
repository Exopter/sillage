require "test_helper"
require_relative "../support/exo_fdr_binary"
require_relative "../support/method_replacement"

class FlightRecordingActivityFlowTest < ActionDispatch::IntegrationTest
  include ExoFdrBinary
  include MethodReplacement

  setup { sign_in_as users(:julien) }

  test "stationary imports retain the source without creating a flight or sample rows" do
    import = stationary_import
    assert_no_difference [ -> { Flight.count }, -> { TrackPoint.count }, -> { SensorSample.count } ] do
      ExoFdr::ImportService.new(import).call
    end
    assert import.reload.set_aside?
    assert_equal "stationary", import.activity_classification
    assert import.source_files.first.download.present?
    assert_equal Time.utc(2026, 9, 7, 10), import.log_started_at

    get flights_path
    assert_select "a[href=?]", flight_import_path(import), count: 0
    get flights_path(filter: "set_aside")
    assert_select "nav[aria-label='Flights filters'] a[aria-current='page']", text: "Set aside"
    assert_select "a.flights-code[href=?]", flight_import_path(import), text: "FDR000001.BIN"
    assert_includes response.body, "Stationary"
    get flights_path(filter: "all")
    assert_select "a.flights-code[href=?]", flight_import_path(import), count: 1
    get flight_import_path(import)
    assert_select ".sillage-subtabs a[aria-current='page']", text: "Flights"
    assert_select "form[action=?]", include_in_flights_flight_import_path(import)
    assert_includes response.body, "Download FDR000001.BIN"
  end

  test "including a source queues one import and preserves the decision through replay" do
    import = stationary_import
    ExoFdr::ImportService.new(import).call
    original_source = import.source_files.first.download
    assert_enqueued_jobs 1, only: ExoFdrImportJob do
      2.times { post include_in_flights_flight_import_path(import) }
    end
    assert_response :redirect
    ExoFdr::ImportService.new(import.reload).call
    flight = import.flights.sole
    assert_equal 31, flight.track_points.count
    assert import.reload.included_in_flights_at?
    assert_not import.set_aside?
    ExoFdr::ImportService.new(import.reload).call
    assert_equal flight.id, import.flights.sole.id
    assert_equal original_source, import.source_files.first.download
    get flights_path
    assert_select "a.flights-code[href=?]", flight_path(flight), count: 1
  end

  test "queue failure rolls back inclusion so a subsequent click can retry" do
    import = stationary_import
    ExoFdr::ImportService.new(import).call
    replace_method(ExoFdrImportJob, :perform_later, ->(*) { false }) do
      post include_in_flights_flight_import_path(import)
    end
    assert import.reload.set_aside?
    assert_nil import.included_in_flights_at
    assert_enqueued_jobs 1, only: ExoFdrImportJob do
      post include_in_flights_flight_import_path(import)
    end
  end

  test "failed materialization can retry without losing the manual inclusion decision" do
    import = stationary_import
    ExoFdr::ImportService.new(import).call
    post include_in_flights_flight_import_path(import)
    included_at = import.reload.included_in_flights_at
    import.update!(status: "failed", error_message: "Temporary source read failure")
    get flight_import_path(import)
    assert_select "button", text: "Retry import"
    assert_enqueued_jobs 1, only: ExoFdrImportJob do
      post include_in_flights_flight_import_path(import)
    end
    assert_equal included_at, import.reload.included_in_flights_at
    assert import.pending?
  end

  test "search strings and pagination never become executable query fragments" do
    import = stationary_import
    ExoFdr::ImportService.new(import).call
    [ "' OR 1=1 --", "%", "_", "'; DROP TABLE flights; --" ].each do |query|
      get flights_path(filter: "all", q: query, page: "1; DROP TABLE flights")
      assert_response :success
      assert_select "a.flights-code[href=?]", flight_import_path(import), count: 0
    end
    assert Flight.table_exists?
  end

  test "one user cannot read or include another user's recording" do
    import = stationary_import
    ExoFdr::ImportService.new(import).call
    other = User.create!(email_address: "recording-owner@example.com", password: "secure-password")
    import.update!(user: other)
    get flights_path(filter: "all")
    assert_select "a[href=?]", flight_import_path(import), count: 0
    get flight_import_path(import)
    assert_response :not_found
    post include_in_flights_flight_import_path(import)
    assert_response :not_found
    assert_nil import.reload.included_in_flights_at
  end

  test "historical flights are hidden without deletion and restore without reimport" do
    import = stationary_import
    import.update!(included_in_flights_at: Time.current)
    ExoFdr::ImportService.new(import).call
    flight = import.flights.sole
    import.update!(included_in_flights_at: nil)
    get flights_path(filter: "all", q: "FDR000001")
    assert_select "a.flights-code[href=?]", flight_import_path(import), count: 1
    assert_select "a.flights-code[href=?]", flight_path(flight), count: 0
    assert_no_difference [ -> { Flight.count }, -> { TrackPoint.count } ] do
      assert_no_enqueued_jobs only: ExoFdrImportJob do
        post include_in_flights_flight_import_path(import)
      end
    end
    assert_equal flight.id, import.flights.sole.id
  end

  test "GPS uncertainty and short moving recordings stay in Flights" do
    import = fdr_import(fdr_binary([ { sequence: 0, timestamp_us: 0 }, { sequence: 1, timestamp_us: 1_000_000 } ]),
      details: { "sync" => { "transport" => "usb_cdc" } })
    ExoFdr::ImportService.new(import).call
    assert_equal "needs_review", import.reload.activity_classification
    get flights_path
    assert_select "a.flights-code[href=?]", flight_path(import.flights.sole)
    assert_includes response.body, "Needs review"
  end

  test "an explicitly targeted flight remains included even for stationary data" do
    target = users(:julien).flights.create!(name: "Prepared flight", status: "preparation")
    import = stationary_import(target_flight: target)
    ExoFdr::ImportService.new(import).call
    assert_not import.reload.set_aside?
    assert_equal target.id, import.flights.sole.id
  end

  test "pagination and search retain the selected filter without duplicating rows" do
    32.times do |index|
      users(:julien).flight_imports.create!(import_type: "exofdr", status: "imported", source_filename: "Archived #{index}",
        activity_classification: "technical")
    end
    get flights_path(filter: "set_aside", q: "Archived")
    assert_select "tbody tr", count: 30
    assert_select "input[name='filter'][value='set_aside']"
    assert_select "a[rel='next'][href*='filter=set_aside']"
    get flights_path(filter: "set_aside", q: "Archived", page: 2)
    assert_select "tbody tr", count: 2
    assert_select "a[rel='next']", count: 0
  end

  private

  def stationary_import(**attributes)
    records = (0..30).map do |time|
      payload = [ time * 1_000, 2026, 9, 7, 10, 0, time, 1, 80, 0, 3, 1, 0, 12,
        100_000_000, 440_000_000, 100_000, 100_000, 1_000, 2_000,
        30, 0, 0, 30, 0, 50, 10_000, 125 ].pack("VvC6Vl<C4l<4V2l<5V2v")
      { sequence: time, timestamp_us: time * 1_000_000, type: 1, payload: }
    end
    fdr_import(fdr_binary(records), **attributes)
  end
end
