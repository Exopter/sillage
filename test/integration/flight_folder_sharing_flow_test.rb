require "test_helper"

class FlightFolderSharingFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:julien)
    @member = users(:operator)
    @folder = @owner.flight_folders.create!(name: "Shared campaign", visibility: "shared", members: [ @member ])
    @flight = flights(:one)
    @flight.update!(folder: @folder)
    sign_in_as @member
  end

  test "members read inherited private flights and contribute only their own flights" do
    get flights_path(folder: @folder.id, visibility: "shared")
    assert_response :success
    assert_select "a.exds-browser-entry-link[data-open-url=?]", flight_path(@flight)
    assert_select "input[name='entries[]'][value=?]", "flight:#{@flight.id}", count: 0
    get preview_flights_path(id: @flight.id), headers: { "Turbo-Frame" => "flight-preview" }
    assert_response :success
    assert_select "turbo-frame#flight-preview"
    assert_select ".exds-browser-sidebar", count: 0
    assert_select "small", text: "From folder"
    assert_select "button[aria-label='Move flight']", count: 0
    get flight_path(@flight)
    assert_response :success
    patch flight_path(@flight), params: { flight: { name: "Forbidden" } }
    assert_response :not_found
    get flight_import_path(@flight.flight_import)
    assert_response :not_found
    get preview_flights_path(id: @flight.flight_import_id, kind: "import")
    assert_response :not_found

    own = @member.flights.create!(name: "Member's flight")
    post bulk_action_flights_path, params: { operation: "move", entries: [ "flight:#{own.id}" ], destination_folder_id: @folder.id }
    assert_response :see_other
    assert_equal @folder.id, own.reload.folder_id
    assert_equal "shared", own.effective_visibility
    get new_flight_path(folder: @folder.id)
    assert_response :success
    post bulk_action_flights_path, params: { operation: "move", entries: [ "flight:#{own.id}", "flight:#{@flight.id}" ], destination_folder_id: "unfiled" }
    assert_response :not_found
    assert_equal @folder.id, own.reload.folder_id
    patch flight_folder_path(@folder), params: { flight_folder: { visibility: "public" } }
    assert_response :not_found
  end

  test "revocation immediately removes access including cached replay and preview" do
    get flight_path(@flight)
    assert_response :success
    @folder.memberships.destroy_all
    [ flights_path(folder: @folder.id), flight_path(@flight), preview_flights_path(id: @flight.id) ].each do |path|
      get path
      assert_response :not_found
    end
    @folder.update!(members: [ @member ], visibility: "private")
    get flight_path(@flight)
    assert_response :not_found
    assert_not FlightFolder.contributable_to(@member).exists?(@folder.id)
  end

  test "public folders are readable by authenticated nonmembers without contribution rights" do
    @folder.update!(visibility: "public", members: [])
    get flights_path(folder: @folder.id)
    assert_response :success
    get flight_path(@flight)
    assert_response :success
    own = @member.flights.create!(name: "Own flight")
    patch flight_path(own), params: { flight: { folder_id: @folder.id } }, as: :json
    assert_response :unprocessable_entity
    assert_nil own.reload.folder_id
    delete logout_path
    [ flights_path(folder: @folder.id), flight_path(@flight), preview_flights_path(id: @flight.id) ].each do |path|
      get path
      assert_redirected_to new_session_path
    end
  end

  test "a revoked member retains ownership and can unfile their own contribution" do
    own = @member.flights.create!(name: "Own contribution", folder: @folder)
    @folder.update!(visibility: "private", members: [])
    patch flight_path(own), params: { flight: { name: "Still owned" } }, as: :json
    assert_response :success
    post bulk_action_flights_path, params: { operation: "move", entries: [ "flight:#{own.id}" ], destination_folder_id: "unfiled" }
    assert_response :see_other
    assert_nil own.reload.folder_id
    assert_equal "private", own.effective_visibility
  end

  test "owner manages membership atomically and rejects unaccepted or missing accounts" do
    sign_in_as @owner
    get edit_flight_folder_path(@folder), headers: { "Turbo-Frame" => "folder-sharing" }
    assert_select "turbo-frame#folder-sharing dialog"
    assert_select ".exds-browser-member-list input[type='hidden'][name='flight_folder[member_ids][]'][value=?]", @member.id.to_s
    assert_select "input[type='checkbox']", count: 0
    [ users(:invited).id, 999_999_999, @owner.id ].each do |id|
      patch flight_folder_path(@folder), params: { flight_folder: { visibility: "public", member_ids: [ id ] } }
      assert_response :not_found
      assert_equal "shared", @folder.reload.visibility
      assert_equal [ @member.id ], @folder.member_ids
    end
    patch flight_folder_path(@folder), params: { return_to_browser: "1", flight_folder: { visibility: "public", member_ids: [ "" ] } }
    assert_redirected_to flights_path(folder: @folder.id)
    assert_empty @folder.reload.members
    assert_equal "public", @folder.visibility
  end

  test "member search is authenticated bounded and excludes ineligible or selected people" do
    get member_search_flight_folders_path(q: "exopter")
    assert_response :success
    assert_equal [ @owner.id ], response.parsed_body.fetch("members").map { |member| member.fetch("id") }
    assert_equal %w[email id], response.parsed_body.fetch("members").first.keys.sort
    assert_match "no-store", response.headers["Cache-Control"]

    get member_search_flight_folders_path(q: "exopter", exclude_ids: [ @owner.id ])
    assert_empty response.parsed_body.fetch("members")
    [ "", "e", "%_" ].each do |query|
      get member_search_flight_folders_path(q: query)
      assert_empty response.parsed_body.fetch("members")
    end
    @owner.update!(disabled_at: Time.current)
    get member_search_flight_folders_path(q: "JULIEN")
    assert_empty response.parsed_body.fetch("members")

    10.times do |index|
      User.create!(email_address: "search-#{index}@example.test", password: "password123456", invitation_accepted_at: Time.current)
    end
    get member_search_flight_folders_path(q: "SEARCH-")
    assert_equal 8, response.parsed_body.fetch("members").length
    assert response.parsed_body.fetch("has_more")
    get new_flight_folder_path
    assert_select ".exds-browser-member-list li", count: 0
    assert_select "body", text: /search-0@example.test/, count: 0

    delete logout_path
    get member_search_flight_folders_path(q: "search-")
    assert_redirected_to new_session_path
    sign_in_as @member
    @member.update!(disabled_at: Time.current)
    get member_search_flight_folders_path(q: "search-")
    assert_redirected_to new_session_path
  end
end
