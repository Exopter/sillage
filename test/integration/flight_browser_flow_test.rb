require "test_helper"

class FlightBrowserFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:julien)
    @flight = flights(:one)
    @folder = @owner.flight_folders.create!(name: "Campaign")
    @flight.update!(folder: @folder)
    sign_in_as @owner
  end

  test "columns are the only view with direct folder actions and a separate preview frame" do
    get flights_path(folder: @folder.id)
    assert_response :success
    assert_select "turbo-frame#flight-browser"
    assert_select ".exds-browser[data-view=columns]"
    assert_select ".exds-browser-entry[aria-current=true][draggable=true][data-entry=?]", "flight:#{@flight.id}"
    assert_select ".exds-browser-entry-link[draggable=false]"
    assert_select ".exds-browser-preview h2", text: @flight.code
    assert_select ".exds-browser-preview a[href=?]", flight_path(@flight), text: /Open flight/
    assert_select "a[aria-label='Grid view']", count: 0
    assert_select "a[aria-label='List view']", count: 0
    assert_select "a[aria-label='Back to all flights']", count: 0
    assert_select ".exds-browser-sidebar a[aria-label='New folder']"
    assert_select ".exds-browser-sidebar a[aria-label='Sharing and members']"
    assert_select ".exds-browser-sidebar a[aria-label='Rename folder']"
    assert_select ".exds-browser-sidebar button[aria-label='Delete folder']"
    assert_select ".exds-browser-collection .exds-browser-folder-actions", count: 0
    assert_select "a[href=?]", flight_folders_path, count: 0
    assert_select "a[data-turbo-frame='flight-preview']"
    assert_select ".sillage-subtabs", count: 0
    get flights_path(folder: @folder.id, view: "grid")
    assert_select ".exds-browser[data-view=columns]"
    get flights_path(folder: @folder.id, view: "list")
    assert_select ".flights-table", count: 0
    assert_select ".exds-browser[data-view=columns]"
  end

  test "preview selection cannot reveal flights outside the authorized page or owner folder names" do
    other = users(:operator)
    secret_folder = other.flight_folders.create!(name: "Secret campaign")
    secret = other.flights.create!(name: "Secret flight", folder: secret_folder)
    shared = other.flights.create!(name: "Shared flight", visibility: "team")
    get flights_path(selected: "flight:#{secret.id}")
    assert_not_includes response.body, secret.name
    assert_not_includes response.body, secret_folder.name
    get flights_path(selected: "flight:#{shared.id}")
    assert_select ".exds-browser-preview h2", text: shared.code
    assert_select ".exds-browser-preview button[aria-label='Move flight']", count: 0
    assert_select ".exds-browser-entry[data-entry=?][draggable=false]", "flight:#{shared.id}"
    assert_not_includes response.body, secret_folder.name
  end

  test "empty and filtered folders keep their navigation and explicit empty states" do
    get flights_path(folder: @folder.id, q: "Nothing matches", visibility: "team")
    assert_select ".exds-browser-entry", count: 0
    assert_select ".exds-browser-empty strong", text: "No matching flights"
    assert_select "input[name=q][value='Nothing matches']"
    assert_select "select[name=visibility] option[value=public][selected]"
    assert_select ".exds-browser-nav[aria-current=page]", text: /Campaign/
  end

  test "folder dialog rename returns to its column" do
    patch flight_folder_path(@folder), params: { flight_folder: { name: "New campaign" }, return_to_browser: "1" }
    assert_redirected_to flights_path(folder: @folder.id)
    follow_redirect!
    assert_select ".exds-browser-collection h2", text: "New campaign"
  end

  test "new edit preparation and import use the columns workspace even on direct navigation" do
    @flight.update!(status: "preparation")
    [ new_flight_path(folder: @folder.id), edit_flight_path(@flight), flight_path(@flight), new_flight_import_path(flight_id: @flight.id) ].each do |path|
      get path
      assert_response :success
      assert_select ".app-shell.is-full-bleed turbo-frame#flight-browser"
      assert_select ".exds-browser[data-view=columns][data-mobile-preview]"
      assert_select ".exds-browser-sidebar a[aria-current=page]", text: /Campaign/
      assert_select ".exds-browser-entry[data-entry=?]", "flight:#{@flight.id}"
      assert_select "turbo-frame#flight-preview .exds-browser-editor"
      assert_select ".sillage-subtabs, .operations-page", count: 0
    end
    assert_select "input[name='flight_import[target_flight_id]'][value=?]", @flight.id.to_s
  end

  test "new flight preserves context through validation creation and preparation" do
    context = { folder: @folder.id.to_s, q: "Campaign", return_to_browser: "1" }
    get new_flight_path, params: context, headers: { "Turbo-Frame" => "flight-browser" }
    assert_select "turbo-frame#flight-browser form[data-turbo-frame=flight-browser] input[name=q][value=Campaign]"
    assert_select "select[name='flight[folder_id]'] option[value=?][selected]", @folder.id.to_s
    post flights_path, params: context.merge(flight: { name: "Campaign draft", folder_id: @folder.id })
    assert_response :unprocessable_entity
    assert_select "turbo-frame#flight-browser .workspace-errors", text: /Location/
    assert_select "input[name='flight[description]'][value='Campaign draft']"
    assert_select ".exds-browser-sidebar a[aria-current=page]", text: /Campaign/
    assert_difference -> { Flight.count }, 1 do
      post flights_path, params: context.merge(flight: { name: "Campaign draft", flown_on: "2026-10-18", location: "Bouloc", fdr_id: create_exofdr_assembly.id, aircraft_id: aircraft(:pilatus).id, folder_id: @folder.id })
    end
    created = @owner.flights.find_by!(name: "Campaign draft")
    assert_redirected_to flight_path(created, folder: @folder.id, q: "Campaign")
    follow_redirect!
    assert_select "#flight-panel-title", text: created.code
    assert_select "turbo-frame#flight-browser .flash.notice", text: /Flight logged/
    assert_select ".exds-browser-entry[aria-current=true][data-entry=?]", "flight:#{created.id}"
    assert_select "a[href=?]", signal_path(flight_id: created.id)
  end

  test "editing keeps validation in the workspace and returns to the selected flight" do
    context = { folder: @folder.id.to_s, return_to_browser: "1" }
    patch flight_path(@flight), params: context.merge(flight: { location: "" })
    assert_response :unprocessable_entity
    assert_select "turbo-frame#flight-browser .workspace-errors", text: /Location can't be blank/
    assert_select "#flight-panel-title", text: "Edit flight"
    patch flight_path(@flight), params: context.merge(flight: { name: "Renamed flight" })
    assert_redirected_to flights_path(folder: @folder.id, selected: "flight:#{@flight.id}")
    follow_redirect!
    assert_select ".exds-browser-preview h2", text: @flight.code
    assert_select ".exds-browser-sidebar a[aria-current=page]", text: /Campaign/
  end

  test "editor folder options never expose a rejected private destination" do
    secret = users(:operator).flight_folders.create!(name: "Hidden destination")
    post flights_path, params: { flight: { name: "Rejected", aircraft_id: aircraft(:pilatus).id, folder_id: secret.id } }
    assert_response :unprocessable_entity
    assert_not_includes response.body, secret.name
    patch flight_path(@flight), params: { return_to_browser: "1", flight: { folder_id: secret.id } }
    assert_response :unprocessable_entity
    assert_not_includes response.body, secret.name
    assert_equal @folder.id, @flight.reload.folder_id
  end

  test "pagination from an editor returns to the collection instead of another form" do
    get new_flight_path(folder: @folder.id, page: 2)
    assert_select ".exds-browser-pagination a[href=?]", flights_path(folder: @folder.id, page: 1), text: "Previous"
    assert_select ".exds-browser-sidebar a[href*='page=']", count: 0
  end
end
