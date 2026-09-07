require "test_helper"
require_relative "../support/method_replacement"

class FlightSelectionFlowTest < ActionDispatch::IntegrationTest
  include MethodReplacement

  setup { sign_in_as users(:julien) }

  test "one selection deletes flights and raw recordings completely and preserves the filter" do
    flight = flights(:one)
    import = flight.flight_import
    raw = recording("Bench recording")
    ids = [ import.id, raw.id ]
    [ import, raw ].each do |entry|
      entry.source_files.attach(io: StringIO.new("data"), filename: "source.bin")
    end
    blob_ids = ActiveStorage::Attachment.where(record: [ import, raw ]).pluck(:blob_id)
    delete bulk_destroy_flights_path, params: { entries: [ "flight:#{flight.id}", "import:#{raw.id}" ], filter: "all", q: "Bench" }
    assert_response :see_other
    assert_redirected_to flights_path(filter: "all", q: "Bench")
    assert_equal "2 entries deleted.", flash[:notice]
    assert_empty FlightImport.where(id: ids)
    assert_not Flight.exists?(flight.id)
    assert_empty TrackPoint.where(flight_id: flight.id)
    assert_empty SensorSample.where(flight_id: flight.id)
    PurgeFlightDataJob.perform_now(blob_ids)
    assert_empty ActiveStorage::Blob.where(id: blob_ids)
    assert Flight.exists?(flights(:two).id)
  end

  test "all entries are authorized before any deletion" do
    mine = recording("My recording")
    other = recording("Another user's recording", user: users(:operator))
    [ "import:#{other.id}", "flight:999999999" ].each do |forbidden|
      delete bulk_destroy_flights_path, params: { entries: [ "import:#{mine.id}", forbidden ] }
      assert_response :not_found
      assert FlightImport.exists?(mine.id)
      assert FlightImport.exists?(other.id)
    end
  end

  test "empty malformed and oversized selections cannot delete anything" do
    mine = recording("My recording")
    invalid = [ nil, [], "import:#{mine.id}", { "import" => mine.id }, [ "import:#{mine.id}", "flight:1 OR 1=1" ],
      [ "import:#{mine.id}" ] * 31 ]
    invalid.each do |entries|
      delete bulk_destroy_flights_path, params: { entries: }
      assert_response :see_other
      assert flash[:alert]
      assert FlightImport.exists?(mine.id)
    end
  end

  test "duplicates and an import selected with its own flight are deleted once" do
    flight = flights(:one)
    import = flight.flight_import
    delete bulk_destroy_flights_path, params: { entries: [ "flight:#{flight.id}", "flight:#{flight.id}", "import:#{import.id}" ] }
    assert_response :see_other
    assert_not Flight.exists?(flight.id)
    assert_not FlightImport.exists?(import.id)
  end

  test "deleting several flights from a shared import removes it after the last flight" do
    first = flights(:one)
    import = first.flight_import
    second = import.flights.create!(user: first.user, name: "Second flight")
    delete bulk_destroy_flights_path, params: { entries: [ "flight:#{second.id}", "flight:#{first.id}" ] }
    assert_response :see_other
    assert_not FlightImport.exists?(import.id)
    assert_not Flight.exists?(second.id)
  end

  test "a later cleanup queue failure rolls back the entire selection" do
    first = recording("First")
    second = recording("Second")
    [ first, second ].each { |entry| entry.source_files.attach(io: StringIO.new("data"), filename: "source.bin") }
    calls = 0
    replace_method(PurgeFlightDataJob, :perform_later, ->(*) { calls += 1; calls < 2 }) do
      delete bulk_destroy_flights_path, params: { entries: [ "import:#{first.id}", "import:#{second.id}" ] }
    end
    assert_response :see_other
    assert flash[:alert]
    [ first, second ].each { |entry| assert_equal "data", entry.reload.source_files.first.download }
  end

  test "missing table values share one placeholder while zero duration remains visible" do
    missing = recording("Missing fields")
    zero = recording("Zero duration", activity_summary: { "duration_seconds" => 0 })
    get flights_path(filter: "set_aside")
    assert_response :success
    assert_select "tr:has(input[value='import:#{missing.id}'])" do
      assert_select ".sr-only", text: "Data unavailable", count: 4
      assert_select "span[aria-hidden='true']", text: "—", count: 4
    end
    assert_select "tr:has(input[value='import:#{zero.id}']) td", text: "00:00"
    [ "To complete", "Date unknown", "Not recorded", "No data yet" ].each { |text| assert_not_includes response.body, text }
    assert_select "button[type='submit'][disabled]", text: "Delete selected"
    assert_select "input[data-table-selection-target='all']"
  end

  private

  def recording(name, user: users(:julien), **attributes)
    user.flight_imports.create!(source_filename: name, import_type: "exofdr", status: "imported",
      activity_classification: "technical", **attributes)
  end
end
