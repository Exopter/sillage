require "test_helper"

class FlightCollaborationFlowTest < ActionDispatch::IntegrationTest
  setup do
    @creator = users(:julien)
    @collaborator = users(:operator)
    @flight = flights(:one)
    @flight.update!(visibility: "team")
    sign_in_as @collaborator
  end

  test "a collaborator can change equipment and video synchronization" do
    patch flight_path(@flight), params: { flight: { description: "Team review", aircraft_id: aircraft(:exowing).id,
      video_exit_offset_seconds: 12.5, user_id: @collaborator.id } }, as: :json
    assert_response :success
    assert_equal "Team review", @flight.reload.description
    assert_equal aircraft(:exowing), @flight.aircraft
    assert_equal 12.5, @flight.video_exit_offset_seconds
    assert_equal @creator, @flight.user
  end

  test "form and bulk moves use the acting person's destination permissions" do
    destination = @collaborator.flight_folders.create!(name: "Collaborator workspace")
    patch flight_path(@flight), params: { flight: { folder_id: destination.id } }, as: :json
    assert_response :success
    assert_equal destination, @flight.reload.folder
    assert_equal @creator, @flight.user
    assert @flight.visible_to?(@creator)
    post bulk_action_flights_path, params: { operation: "move", entries: [ "flight:#{@flight.id}" ], destination_folder_id: "unfiled" }
    assert_response :see_other
    assert_nil @flight.reload.folder_id
    post bulk_action_flights_path, params: { operation: "move", entries: [ "flight:#{@flight.id}" ], destination_folder_id: destination.id }
    assert_response :see_other
    assert_equal destination, @flight.reload.folder
    assert_equal @creator, @flight.user
  end

  test "a collaborator can change unfiled visibility and returns to the library after losing access" do
    patch flight_path(@flight), params: { flight: { visibility: "private" } }
    assert_redirected_to flights_path
    assert_equal "private", @flight.reload.visibility
    get flight_path(@flight)
    assert_response :not_found
  end

  test "public folder viewers can edit its flights without receiving folder administration rights" do
    folder = @creator.flight_folders.create!(name: "Public campaign", visibility: "public")
    @flight.update!(folder: folder, visibility: "private")
    get edit_flight_path(@flight)
    assert_response :success
    assert_select "select[name='flight[folder_id]'] option[selected][value=?]", folder.id.to_s
    patch flight_path(@flight), params: { flight: { description: "Public review", folder_id: folder.id } }, as: :json
    assert_response :success
    assert_equal "Public review", @flight.reload.description
    delete flight_folder_path(folder)
    assert_response :not_found
    assert_difference "Flight.count", -1 do
      delete flight_path(@flight)
      assert_response :redirect
    end
    assert FlightFolder.exists?(folder.id)
  end

  test "revocation rejects individual edits imports and mixed bulk actions" do
    own = @collaborator.flights.create!(name: "Own entry")
    @flight.update!(visibility: "private")
    get new_flight_import_path(flight_id: @flight.id)
    assert_response :not_found
    post flight_imports_path, params: { flight_import: { target_flight_id: @flight.id, import_type: "flysight" } }
    assert_response :not_found
    patch flight_path(@flight), params: { flight: { description: "Forbidden" } }
    assert_response :not_found
    [ "move", "delete" ].each do |operation|
      post bulk_action_flights_path, params: { operation:, entries: [ "flight:#{own.id}", "flight:#{@flight.id}" ], destination_folder_id: "unfiled" }
      assert_response :not_found
      assert Flight.exists?(own.id)
      assert Flight.exists?(@flight.id)
    end
  end

  test "a collaborator imports into an existing flight without changing its creator and deletion cleans both users' data" do
    import_recording
    perform_enqueued_jobs only: FlySightImportJob
    assert @flight.reload.analysed?
    assert_equal @creator, @flight.user
    assert_equal @collaborator, @flight.flight_import.user
    assert_equal "MyString", @flight.description
    assert @flight.track_points.exists?
    import = @flight.flight_import
    source_ids = import.source_files.blobs.pluck(:id)
    get flights_path
    assert_select "input[name='entries[]'][value=?]", "flight:#{@flight.id}"
    assert_select "input[name='entries[]'][value=?]", "import:#{import.id}", count: 0
    sign_in_as @creator
    get attachment_path(import.source_files.first)
    assert_response :success
    delete flight_path(@flight)
    assert_response :redirect
    assert_not FlightImport.exists?(import.id)
    assert_not Flight.exists?(@flight.id)
    assert_empty TrackPoint.where(flight_id: @flight.id)
    assert_empty ActiveStorage::Attachment.where(blob_id: source_ids)
  end

  test "queued imports cannot modify a flight after access is revoked" do
    import_recording
    import = @collaborator.flight_imports.order(:id).last
    @flight.update!(visibility: "private")
    original_count = @flight.track_points.count
    assert_raises(FlySight::Error) { FlySight::ImportService.new(import).call }
    assert_equal original_count, @flight.track_points.count
    assert_equal @creator, @flight.reload.user
    assert_equal "processing", @flight.status
    assert import.reload.failed?
  end

  test "flight access also grants Signal session access and revocation blocks its operator" do
    @flight.update!(status: "preparation")
    session = Signal::StartSession.new(user: @collaborator, flight_id: @flight.id).call
    get signal_path(session: session.uuid)
    assert_response :success
    post batches_api_v1_signal_session_path(session.uuid), params: { sequence: 0, samples: [] }, as: :json
    assert_response :success
    sign_in_as @creator
    get signal_path(session: session.uuid)
    assert_response :success
    post batches_api_v1_signal_session_path(session.uuid), params: { sequence: 1, samples: [] }, as: :json
    assert_response :success
    assert_equal @collaborator, session.reload.user
    @flight.update!(visibility: "private")
    sign_in_as @collaborator
    get signal_path(session: session.uuid)
    assert_response :not_found
    assert_no_difference "SignalBatch.count" do
      post batches_api_v1_signal_session_path(session.uuid), params: { sequence: 2, samples: [] }, as: :json
      assert_response :not_found
    end
    patch complete_api_v1_signal_session_path(session.uuid), params: { disposition: "save" }, as: :json
    assert_response :not_found
    post retry_processing_signal_session_path(session.uuid)
    assert_response :not_found
  end

  test "source archives require access to every contained flight and respect revocation" do
    import = @flight.flight_import
    import.source_files.attach(io: StringIO.new("recording"), filename: "source.csv")
    source = import.source_files.first
    get attachment_path(source)
    assert_response :success
    sibling = import.flights.create!(user: @creator, name: "Private sibling")
    get attachment_path(source)
    assert_response :not_found
    assert_no_difference [ "Flight.count", "FlightImport.count" ] do
      delete flight_import_path(import)
      assert_response :not_found
    end
    delete flight_path(@flight)
    assert_response :redirect
    assert Flight.exists?(sibling.id)
    assert FlightImport.exists?(import.id)
    assert_equal "recording", source.reload.download
  end

  private

  def import_recording
    get new_flight_import_path(flight_id: @flight.id)
    assert_response :success
    post flight_imports_path, params: { flight_import: { target_flight_id: @flight.id, import_type: "flysight",
      source_files: [ fixture_file_upload("flysight_v2/TRACK.CSV", "text/csv"), fixture_file_upload("flysight_v2/SENSOR.CSV", "text/csv") ] } }
    assert_response :redirect
  end
end
