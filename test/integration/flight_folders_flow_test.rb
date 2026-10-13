require "test_helper"

class FlightFoldersFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:julien)
    @other = users(:operator)
    @folder = @owner.flight_folders.create!(name: "Flight tests")
    @other_folder = @other.flight_folders.create!(name: "Confidential folder")
    @flight = flights(:one)
    @flight.update!(folder: @folder)
    @shared = @owner.flights.create!(name: "Shared mission", folder: @folder, visibility: "team")
    sign_in_as @owner
  end

  test "create rename and delete a personal folder without losing flights" do
    get flight_folders_path
    assert_redirected_to flights_path
    follow_redirect!
    assert_includes response.body, @folder.name
    assert_not_includes response.body, @other_folder.name
    assert_select ".exds-browser-sidebar a[href=?] small", flights_path(filter: "flights", folder: @folder.id), text: "2"
    assert_includes response.headers["Cache-Control"], "no-store"
    get new_flight_folder_path
    assert_select "input[name='flight_folder[name]'][maxlength='100']"
    assert_select "input[type=radio][name='flight_folder[color]']", count: 6
    assert_select "input[name='flight_folder[color]'][checked][value=graphite]"
    assert_difference "@owner.flight_folders.count", 1 do
      post flight_folders_path, params: { flight_folder: { name: "  Training  ", user_id: @other.id } }
    end
    created = @owner.flight_folders.find_by!(name: "Training")
    assert_equal "graphite", created.color
    assert_redirected_to flights_path(folder: created.id)
    get edit_flight_folder_path(@folder)
    assert_response :success
    patch flight_folder_path(@folder), params: { flight_folder: { name: "Renamed", user_id: @other.id } }
    assert_redirected_to flights_path(folder: @folder.id)
    assert_equal "Renamed", @folder.reload.name
    assert_equal @owner.id, @folder.user_id
    assert_no_difference "Flight.count" do
      delete flight_folder_path(@folder)
    end
    assert_redirected_to flights_path
    assert_nil @flight.reload.folder_id
    assert_equal "team", @shared.reload.visibility
  end

  test "invalid folder names render errors and preserve existing folders" do
    [ " ", "FLIGHT TESTS", "x" * 101 ].each do |name|
      assert_no_difference "FlightFolder.count" do
        post flight_folders_path, params: { flight_folder: { name: name } }
      end
      assert_response :unprocessable_entity
      assert_select ".workspace-errors"
    end
    patch flight_folder_path(@folder), params: { flight_folder: { name: "" } }
    assert_response :unprocessable_entity
    assert_equal "Flight tests", @folder.reload.name
  end

  test "folder colors persist across creation editing and shared views and reject values outside the palette" do
    get new_flight_folder_path, headers: { "Turbo-Frame" => "folder-sharing" }
    assert_select "dialog input[name='flight_folder[color]'][checked][value=graphite]"
    post flight_folders_path, params: { flight_folder: { name: "", color: "violet" } }
    assert_response :unprocessable_entity
    assert_select "input[name='flight_folder[color]'][checked][value=violet]"
    post flight_folders_path, params: { flight_folder: { name: "Colored campaign", color: "violet" } }
    created = @owner.flight_folders.find_by!(name: "Colored campaign")
    assert_equal "violet", created.color
    @folder.update!(visibility: "shared", members: [ @other ])
    patch color_flight_folder_path(@folder), params: { flight_folder: { color: "aqua", name: "Ignored", visibility: "public", member_ids: [] } }, as: :json
    assert_response :success
    assert_equal "aqua", response.parsed_body["color"]
    assert_equal "aqua", @folder.reload.color
    assert_equal "Flight tests", @folder.name
    assert_equal "shared", @folder.visibility
    assert_equal [ @other.id ], @folder.member_ids
    patch flight_folder_path(@folder), params: { flight_folder: { name: "Renamed campaign" } }
    assert_equal "aqua", @folder.reload.color
    get flights_path(folder: @folder.id)
    assert_select ".exds-browser-color-popover[popover=auto] button[aria-label=Mint][aria-pressed=true]"
    assert_select ".exds-browser-dialog input[name='flight_folder[color]']", count: 0
    [ "", "#ff0000", "red; background:url(https://invalid.test)" ].each do |color|
      patch color_flight_folder_path(@folder), params: { flight_folder: { color: color } }, as: :json
      assert_response :unprocessable_entity
      assert_equal "aqua", @folder.reload.color
    end
    sign_in_as @other
    get flights_path(folder: @folder.id)
    assert_select ".exds-browser-sidebar [data-folder-color-id][style='--exds-folder-color: var(--ex-aqua-500)']", text: /Renamed campaign/
    assert_select "button[aria-label='Change folder color']", count: 0
    patch color_flight_folder_path(@folder), params: { flight_folder: { color: "graphite" } }, as: :json
    assert_response :not_found
    assert_equal "aqua", @folder.reload.color
  end

  test "folder filtering combines with visibility search and pagination" do
    get flights_path(folder: @folder.id)
    assert_select "a.exds-browser-entry-link", count: 2
    assert_select "a.exds-browser-nav[aria-current=page][href*=?]", "folder=#{@folder.id}"
    assert_select "a[href=?]", new_flight_path(folder: @folder.id)
    assert_select "input[name=folder][value=?]", @folder.id.to_s
    get flights_path(folder: @folder.id, visibility: "private")
    assert_select "a.exds-browser-entry-link", count: 2
    get flights_path(folder: @folder.id, visibility: "team", q: "Shared")
    assert_select "a.exds-browser-entry-link", count: 0
    get flights_path(folder: @folder.id, q: "Missing")
    assert_select "a.exds-browser-entry-link", count: 0
    assert_includes response.body, "No flights match"
    31.times { |index| @owner.flights.create!(name: "Campaign #{index}", folder: @folder) }
    get flights_path(folder: @folder.id, visibility: "private", filter: "all", q: "Campaign")
    assert_select ".exds-browser-entry", count: 30
    assert_select "a[rel='next'][href*=?][href*='visibility=private'][href*='filter=all'][href*='q=Campaign']", "folder=#{@folder.id}"
    get flights_path(folder: @folder.id, visibility: "private", filter: "all", q: "Campaign", page: 2)
    assert_select ".exds-browser-entry", count: 1
  end

  test "unfiled contains only my unfiled flights and folders exclude raw recordings" do
    unfiled = @owner.flights.create!(name: "Unfiled mission")
    other_flight = @other.flights.create!(name: "Other shared mission", visibility: "team")
    source = @owner.flight_imports.create!(source_filename: "Raw source", import_type: "exofdr", status: "pending")
    get flights_path(folder: "unfiled", filter: "all")
    assert_select "a.exds-browser-entry-link[data-open-url=?]", flight_path(unfiled, folder: "unfiled", filter: "all")
    assert_select "a.exds-browser-entry-link[data-open-url=?]", flight_path(@flight), count: 0
    assert_select "a.exds-browser-entry-link[data-open-url=?]", flight_path(other_flight), count: 0
    assert_select "input[value=?]", "import:#{source.id}", count: 0
    get flights_path(folder: @folder.id, filter: "all")
    assert_select "input[value=?]", "import:#{source.id}", count: 0
    get flights_path(filter: "all")
    assert_select "input[value=?]", "import:#{source.id}"
  end

  test "folder controls work when creating editing and reviewing flights" do
    get new_flight_path(folder: @folder.id)
    assert_select "select[name='flight[folder_id]'] option[selected][value=?]", @folder.id.to_s
    assert_no_difference "FlightFolder.count" do
      post flights_path, params: { flight: { name: "Prepared", aircraft_id: aircraft(:pilatus).id, folder_id: @folder.id, visibility: "team" } }
    end
    flight = @owner.flights.order(:id).last
    assert_equal @folder.id, flight.folder_id
    assert_equal "team", flight.visibility
    get flight_path(flight)
    assert_select "dd a[href=?]", flights_path(folder: @folder.id), text: @folder.name
    get edit_flight_path(flight)
    assert_select "select[name='flight[folder_id]']"
    get flight_path(@flight)
    assert_select "select[name='flight[folder_id]']"
    patch flight_path(flight), params: { flight: { folder_id: "" } }
    assert_nil flight.reload.folder_id
    assert_equal "team", flight.visibility
  end

  test "another owner's folders and their names never leak through shared flights" do
    sign_in_as @other
    get flights_path
    assert_select "a.exds-browser-entry-link[data-open-url=?]", flight_path(@shared), count: 0
    assert_not_includes response.body, @folder.name
    [ "preparation", "analysed" ].each do |status|
      @shared.update!(status: status)
      get flight_path(@shared)
      assert_response :not_found
      assert_not_includes response.body, @folder.name
      assert_select "select[name='flight[folder_id]']", count: 0
    end
    get flights_path(folder: @folder.id)
    assert_response :not_found
    get new_flight_path(folder: @folder.id)
    assert_response :not_found
    get edit_flight_folder_path(@folder)
    assert_response :not_found
    patch flight_folder_path(@folder), params: { flight_folder: { name: "Changed" } }
    assert_response :not_found
    delete flight_folder_path(@folder)
    assert_response :not_found
    assert FlightFolder.exists?(@folder.id)
  end

  test "individual assignment rejects foreign and missing folders" do
    [ @other_folder.id, 999_999_999 ].each do |folder_id|
      patch flight_path(@flight), params: { flight: { folder_id: folder_id } }, as: :json
      assert_response :unprocessable_entity
      assert_equal @folder.id, @flight.reload.folder_id
      assert_no_difference "Flight.count" do
        post flights_path, params: { flight: { name: "Invalid", aircraft_id: aircraft(:pilatus).id, folder_id: folder_id } }
        assert_response :unprocessable_entity
      end
    end
  end

  test "bulk moves preserve visibility and filters and can unfile flights" do
    destination = @owner.flight_folders.create!(name: "Completed")
    entries = [ "flight:#{@flight.id}", "flight:#{@shared.id}", "flight:#{@flight.id}" ]
    post bulk_action_flights_path, params: { operation: "move", entries: entries, destination_folder_id: destination.id,
      folder: @folder.id, visibility: "private", filter: "all", q: "campaign" }
    assert_response :see_other
    assert_redirected_to flights_path(folder: @folder.id, visibility: "private", filter: "all", q: "campaign")
    assert_equal "2 flights moved.", flash[:notice]
    assert_equal [ destination.id, destination.id ], [ @flight.reload.folder_id, @shared.reload.folder_id ]
    assert_equal [ "private", "team" ], [ @flight.visibility, @shared.visibility ]
    post bulk_action_flights_path, params: { operation: "move", entries: entries, destination_folder_id: "unfiled" }
    assert_nil @flight.reload.folder_id
    assert_nil @shared.reload.folder_id
  end

  test "bulk moves authorize the entire selection and destination before updating" do
    other_flight = @other.flights.create!(name: "Visible other flight", visibility: "team")
    [ "flight:#{other_flight.id}", "flight:999999999" ].each do |entry|
      post bulk_action_flights_path, params: { operation: "move", entries: [ "flight:#{@flight.id}", entry ], destination_folder_id: "unfiled" }
      assert_response :not_found
      assert_equal @folder.id, @flight.reload.folder_id
    end
    post bulk_action_flights_path, params: { operation: "move", entries: [ "flight:#{@flight.id}" ], destination_folder_id: @other_folder.id }
    assert_response :not_found
    assert_equal @folder.id, @flight.reload.folder_id
  end

  test "empty malformed oversized and mixed selections cannot move flights" do
    invalid = [ nil, [], "flight:#{@flight.id}", { "flight" => @flight.id }, [ "flight:1 OR 1=1" ],
      [ "flight:#{@flight.id}" ] * 31, [ "flight:#{@flight.id}", "import:#{@flight.flight_import_id}" ] ]
    invalid.each do |entries|
      post bulk_action_flights_path, params: { operation: "move", entries: entries, destination_folder_id: "unfiled" }
      assert_response :see_other
      assert flash[:alert]
      assert_equal @folder.id, @flight.reload.folder_id
    end
    [ nil, "", "0", "1x", [ @folder.id ] ].each do |destination|
      post bulk_action_flights_path, params: { operation: "move", entries: [ "flight:#{@flight.id}" ], destination_folder_id: destination }
      assert_response :see_other
      assert flash[:alert]
      assert_equal @folder.id, @flight.reload.folder_id
    end
  end

  test "selection toolbar still deletes through its explicit delete action" do
    post bulk_action_flights_path, params: { operation: "delete", entries: [ "flight:#{@shared.id}" ], folder: @folder.id }
    assert_redirected_to flights_path(filter: "flights", folder: @folder.id)
    assert_not Flight.exists?(@shared.id)
    post bulk_action_flights_path, params: { entries: [ "flight:#{@flight.id}" ] }
    assert flash[:alert]
    assert Flight.exists?(@flight.id)
  end

  test "folder management requires authentication" do
    delete logout_path
    patch color_flight_folder_path(@folder), params: { flight_folder: { color: "sky" } }, as: :json
    assert_redirected_to new_session_path
    assert_equal "graphite", @folder.reload.color
    get flight_folders_path
    assert_redirected_to new_session_path
    assert_no_difference "FlightFolder.count" do
      post flight_folders_path, params: { flight_folder: { name: "Anonymous" } }
    end
  end

  test "invalid folder filters are rejected without server errors" do
    [ "missing", "0", "1 OR 1=1", [ @folder.id ], { id: @folder.id } ].each do |folder|
      get flights_path, params: { folder: folder }
      assert_response :not_found
      get new_flight_path, params: { folder: folder }
      assert_response :not_found
    end
  end
end
