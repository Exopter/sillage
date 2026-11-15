require "test_helper"

class ReadOnlyAccessTest < ActionDispatch::IntegrationTest
  setup do
    @viewer = users(:operator)
    @flight = flights(:one)
    @flight.update!(visibility: "team")
    @own_flight = @viewer.flights.create!(name: "Viewer flight", status: "logged", visibility: "private", flown_on: Date.current, location: "Test location")
    @folder = @viewer.flight_folders.create!(name: "Viewer folder")
    @own_flight.update!(folder: @folder)
    @comment = @flight.comments.create!(user: @viewer, body: "Existing viewer comment")
    @signal_session = SignalSession.create!(user: users(:julien), flight: @flight)
    @assembly = create_exofdr_assembly
    @recorder = create_embedded_controller(assembly: @assembly, device_id: "ECU-A172E0")
    @import = @viewer.flight_imports.create!(import_type: "exofdr", status: "pending", source_filename: "viewer.bin")
    sign_in_as @viewer
  end

  test "non-admin navigation exposes only Flights and Signal without hardware controllers" do
    get flights_path(folder: @folder.id)
    assert_response :success
    assert_equal [ "Flights", "Signal" ], css_select(".sillage-room-nav a").map { |link| link.text.strip }
    assert_select "a[href='#{new_flight_path}'], a[href='#{new_flight_import_path}'], a[href='#{new_flight_folder_path}']", count: 0
    assert_select "a[href*='/hangar'], a[href*='/forge'], a[href*='/core']", count: 0
    assert_select "form[method='post']", count: 1 # Signing out remains available.
    assert_select "input[name='entries[]'], [draggable='true'], .exds-selection-toolbar, .exds-browser-folder-actions", count: 0
    assert_select "#sillage-fdr-connectivity, [data-controller='recorder-presence'], [data-controller='feedback']", count: 0
  end

  test "flight replay preview comments and recordings remain readable without write controls" do
    get flight_path(@flight)
    assert_response :success
    assert_select "[data-controller='flight-viewer']"
    assert_includes response.body, @comment.body
    assert_select "form[action='#{flight_path(@flight)}'], form[action='#{flight_comments_path(@flight)}']", count: 0
    assert_select "a[href='#{edit_flight_path(@flight)}']", count: 0
    get preview_flights_path(id: @own_flight.id)
    assert_response :success
    assert_select "a[aria-label='Edit flight'], button[aria-label='Move flight'], a[aria-label='Edit flight visibility']", count: 0
    get flight_comments_path(@flight)
    assert_response :success
    assert_includes response.body, @comment.body
    assert_select "form, .exds-comment-actions", count: 0
    get flights_path(recording: @import.id)
    assert_response :success
    assert_select "form[action='#{flight_import_path(@import)}'], form[action='#{include_in_flights_flight_import_path(@import)}']", count: 0
  end

  test "Signal is readable without acquisition controllers or mutation forms" do
    get signal_path
    assert_response :success
    assert_includes response.body, "Read-only access"
    assert_select "main form, [data-controller='signal-workspace'], [data-controller='signal-connection']", count: 0
    assert_select "a[href='#{signal_path(session: @signal_session.uuid)}']", text: "View session"
    get signal_path(session: @signal_session.uuid)
    assert_response :success
    assert_select "section[aria-label='Selected Signal session']"
    assert_select "a[href='#{flight_path(@flight)}']", text: "Open flight"
    get signal_session_radio_history_path(@signal_session.uuid, format: :csv)
    assert_response :success
  end

  test "every Flight Club rank keeps Flights and profile access without Signal" do
    member = users(:member)
    member.complete_membership_welcome!
    sign_in_as member

    User::MEMBERSHIP_TIERS.each do |tier|
      member.update!(membership_tier: tier)
      get flights_path
      assert_response :success
      assert_equal [ "Flights" ], css_select(".sillage-room-nav a").map { |link| link.text.strip }
      get profile_path
      assert_response :success
      get signal_path
      assert_response :forbidden
      head signal_path
      assert_response :forbidden
      get signal_path(session: @signal_session.uuid), as: :json
      assert_response :forbidden
      get signal_session_radio_history_path(@signal_session.uuid, format: :csv)
      assert_response :forbidden
    end
  end

  test "Flight Club members cannot join live sessions or fetch Signal captures through a shared flight" do
    member = users(:member)
    member.complete_membership_welcome!
    sign_in_as member
    @flight.update!(status: "live")
    @signal_session.raw_capture.attach(io: StringIO.new("radio capture"), filename: "capture.bin")
    get preview_flights_path(id: @flight.id)
    assert_response :success
    assert_select "a[href^='/signal']", count: 0
    get flight_path(@flight)
    assert_response :success
    assert_select "section[aria-label='Signal radio history']", count: 0
    get attachment_path(@signal_session.raw_capture.attachment)
    assert_response :not_found
    post api_v1_signal_sessions_path, params: { flight_id: @flight.id }, as: :json
    assert_response :forbidden
  end

  test "administrators retain Signal access when they also hold a Flight Club membership" do
    admin = users(:julien)
    admin.update!(first_name: "Julien", last_name: "Blancher", membership_tier: "core_team", membership_welcomed_at: Time.current)
    sign_in_as admin
    get signal_path(view: "home")
    assert_response :success
    assert_select ".sillage-room-nav a[href='#{signal_path}']"
    assert_select "button", text: "Create draft flight"
  end

  test "direct URLs cannot open admin rooms or write forms" do
    [ hangar_path, hangar_parts_path, hangar_part_path(@recorder.part), edit_hangar_assembly_path(@assembly),
      forge_path, forge_fdr_path(@assembly.serial_number), core_users_path, core_feedbacks_path,
      new_flight_path, edit_flight_path(@own_flight), new_flight_import_path, new_flight_folder_path,
      edit_flight_folder_path(@folder), edit_flight_comment_path(@flight, @comment),
      flight_imu_check_path(@flight), api_v1_fdr_registration_path,
      api_v1_fdr_import_commands_path ].each do |destination|
      get destination
      assert_response :forbidden, destination
    end
  end

  test "direct mutation requests cannot change even the viewer's own records" do
    before = domain_counts
    requests = [
      [ :post, flights_path ], [ :patch, flight_path(@own_flight) ], [ :delete, flight_path(@own_flight) ],
      [ :post, bulk_action_flights_path ], [ :delete, bulk_destroy_flights_path ],
      [ :post, flight_imports_path ], [ :delete, flight_import_path(@import) ], [ :post, include_in_flights_flight_import_path(@import) ],
      [ :post, flight_folders_path ], [ :patch, flight_folder_path(@folder) ], [ :patch, color_flight_folder_path(@folder) ], [ :delete, flight_folder_path(@folder) ],
      [ :post, flight_comments_path(@flight) ], [ :patch, flight_comment_path(@flight, @comment) ], [ :delete, flight_comment_path(@flight, @comment) ],
      [ :post, signal_sessions_path ], [ :post, draft_signal_sessions_path ], [ :post, retry_processing_signal_session_path(@signal_session.uuid) ],
      [ :post, api_v1_signal_sessions_path ], [ :post, batches_api_v1_signal_session_path(@signal_session.uuid) ],
      [ :post, events_api_v1_signal_session_path(@signal_session.uuid) ], [ :patch, complete_api_v1_signal_session_path(@signal_session.uuid) ],
      [ :post, api_v1_fdr_syncs_path ], [ :post, api_v1_fdr_registration_path ], [ :post, api_v1_fdr_authentication_path ],
      [ :post, api_v1_fdr_recording_commands_path ], [ :post, api_v1_fdr_import_commands_path ], [ :post, api_v1_imu_checks_path ],
      [ :patch, api_v1_recorder_connections_path ], [ :post, api_v1_fdr_wifi_uploads_path ], [ :post, api_v1_fdr_sillage_heartbeat_path ],
      [ :patch, hangar_assembly_path(@assembly) ], [ :delete, hangar_assembly_path(@assembly) ], [ :delete, hangar_part_path(@recorder.part) ],
      [ :post, feedbacks_path ]
    ]
    requests.each do |method, destination|
      public_send(method, destination, params: { flight: { description: "Unauthorized" } }, as: :json)
      assert_response :forbidden, "#{method} #{destination}"
      assert_includes response.parsed_body.fetch("error"), "read-only"
    end
    assert_equal before, domain_counts
    assert_not_equal "Unauthorized", @own_flight.reload.description
  end

  test "read access still respects private flights and sessions" do
    hidden = flights(:two)
    get flight_path(hidden)
    assert_response :not_found
    session = SignalSession.create!(user: hidden.user, flight: hidden)
    get signal_path(session: session.uuid)
    assert_response :not_found
    get signal_session_radio_history_path(session.uuid)
    assert_response :not_found
  end

  test "a role downgrade immediately removes write rights from an existing session" do
    sign_in_as_admin @viewer
    @viewer.update!(role: "user")
    patch flight_path(@own_flight), params: { flight: { description: "Unauthorized" } }
    assert_response :forbidden
    assert_not_equal "Unauthorized", @own_flight.reload.description
    get hangar_path
    assert_response :forbidden
  end

  test "administrators retain operational access" do
    sign_in_as users(:julien)
    get hangar_part_path(@recorder.part)
    assert_response :success
    assert_select "button", text: "Delete part"
    patch flight_path(@flight), params: { flight: { description: "Administrator update" } }
    assert_response :redirect
    assert_equal "Administrator update", @flight.reload.description
    get signal_path(view: "home")
    assert_select "button", text: "Create draft flight"
    assert_select "#sillage-fdr-connectivity"
  end

  test "regular users can still sign out" do
    delete logout_path
    assert_response :redirect
    get flights_path
    assert_redirected_to new_session_path
  end

  private

  def domain_counts
    [ Flight, FlightImport, FlightFolder, FlightComment, SignalSession, SignalBatch,
      OperatorEvent, Part, Assembly, FdrWifiUpload, RecorderConnection, Feedback ].to_h { |model| [ model.name, model.count ] }
  end
end
