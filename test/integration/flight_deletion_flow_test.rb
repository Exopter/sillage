require "test_helper"

class FlightDeletionFlowTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:julien) }

  test "missing sources have an explicit status and can be deleted without an orphan row" do
    import = users(:julien).flight_imports.create!(import_type: "exofdr", status: "imported", source_filename: "Missing.BIN",
      activity_classification: "needs_review", activity_summary: { "reason" => "source_unavailable" })
    get flights_path(filter: "all", q: "Missing.BIN")
    assert_includes response.body, "Source missing"
    assert_not_includes response.body, "Needs review"
    get flight_import_path(import)
    assert_select "h2", text: "Source missing"
    assert_select "button", text: "Include in flights", count: 0
    assert_select "button", text: "Delete recording"
    assert_no_enqueued_jobs only: ExoFdrImportJob do
      post include_in_flights_flight_import_path(import)
    end
    assert_nil import.reload.included_in_flights_at
    delete flight_import_path(import)
    assert_redirected_to flights_path
    assert_not FlightImport.exists?(import.id)
    get flights_path(filter: "all", q: "Missing.BIN")
    assert_select "tbody tr", count: 0
  end

  test "deleting a flight also removes its import" do
    flight = flights(:one)
    import_id = flight.flight_import_id
    delete flight_path(flight)
    assert_redirected_to flights_path
    assert_not Flight.exists?(flight.id)
    assert_not FlightImport.exists?(import_id)
  end

  test "one user cannot delete another user's flight or recording" do
    flight = flights(:one)
    import = flight.flight_import
    flight.update!(user: users(:operator))
    import.update!(user: users(:operator))
    delete flight_path(flight)
    assert_response :not_found
    delete flight_import_path(import)
    assert_response :not_found
    assert Flight.exists?(flight.id)
    assert FlightImport.exists?(import.id)
  end
end
