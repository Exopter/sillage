require "test_helper"

class FlightBrowserFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:julien)
    @flight = flights(:one)
    @folder = @owner.flight_folders.create!(name: "Campaign")
    @flight.update!(folder: @folder)
    sign_in_as @owner
  end

  test "the preview opens the flight from its header actions" do
    get preview_flights_path(id: @flight.id, kind: "flight"), headers: { "Turbo-Frame" => "flight-preview" }
    assert_select ".exds-browser-preview-heading .exds-browser-preview-actions > a.exds-btn--primary:first-child[href=?]", flight_path(@flight), text: /Open flight/
    assert_select ".exds-browser-preview > header + a", count: 0
  end

  test "a flight waiting for a recording can be completed from its preview" do
    @flight.update!(status: "waiting_for_recording", flight_import: nil)
    @flight.signal_sessions.create!(user: @owner, status: "completed")

    get preview_flights_path(id: @flight.id, kind: "flight", folder: @folder.id), headers: { "Turbo-Frame" => "flight-preview" }
    assert_select "summary[aria-label='Edit status'] .status-dot", text: "Waiting for recording"
    assert_select "form[data-turbo-frame='flight-browser'] select[name='flight[status]'] option[value='completed']", text: "Completed"

    patch flight_path(@flight), params: { flight: { status: "completed" }, return_to_browser: "1", folder: @folder.id }
    assert_redirected_to flights_path(folder: @folder.id, selected: "flight:#{@flight.id}")
    assert_predicate @flight.reload, :completed?
    follow_redirect!
    assert_select "#flight-preview .status-dot.is-ready", text: "Completed"
    assert_select "#flight-preview summary[aria-label='Edit status']", count: 0
  end

  test "a status edit does not complete a flight with a recording" do
    @flight.update!(status: "waiting_for_recording")

    patch flight_path(@flight), params: { flight: { status: "completed" } }

    assert_redirected_to flight_path(@flight)
    assert_predicate @flight.reload, :waiting_for_recording?
    assert_equal flight_imports(:one), @flight.flight_import
  end

  test "a flight with tunnel cameras shows them in the list and plays them in the preview" do
    @flight.update!(environment: "tunnel", location: "Inclined Slovenia")
    side, top = %w[Side Top].map do |camera|
      TunnelVideo.create!(flight: @flight, media_token: camera.downcase * 10, filename: "#1_20260515_200219_#{camera}.mp4", camera:, clip_number: 1,
        source_url: "https://shop.example.test/#{camera}", recorded_at: @flight.started_at, status: "ready").tap do |video|
        video.file.attach(io: StringIO.new("0123456789"), filename: "clip.mp4", content_type: "video/mp4", identify: false)
      end
    end
    TunnelVideo.create!(flight: @flight, media_token: "front" * 8, filename: "#1_20260515_200219_Front.mp4", camera: "Front", clip_number: 1,
      source_url: "https://shop.example.test/front", recorded_at: @flight.started_at)

    get flights_path(folder: @folder.id)
    assert_select ".exds-browser-entry[data-entry=?]", "flight:#{@flight.id}" do
      assert_select ".exds-browser-entry-copy strong", text: @flight.description
      assert_select ".is-location", text: "Inclined Slovenia"
      assert_select ".is-location > .exds-browser-location-mode[title='Tunnel'] > svg", 1
      assert_select ".exds-browser-entry-cameras[title='2 cameras']", text: "2 cameras"
    end

    get preview_flights_path(id: @flight.id, kind: "flight"), headers: { "Turbo-Frame" => "flight-preview" }
    assert_select "[data-controller='video-source'] video[preload='metadata'][src=?]", attachment_path(side.file.attachment)
    assert_select "button[data-video-source-target='source']", 2
    assert_select "button[aria-pressed='true']", text: "Side"
    assert_select "button[data-video-source-src-param=?]", attachment_path(top.file.attachment), text: "Top"
    # The cameras sit in their own section, right under the comments.
    assert_select ".exds-comments + section[aria-label='Flight videos']" do
      assert_select ".exds-comments-heading", text: "Videos2"
      assert_select "> .video-player", 1
    end

    top.destroy!
    get preview_flights_path(id: @flight.id, kind: "flight"), headers: { "Turbo-Frame" => "flight-preview" }
    assert_select "video.flight-video", 1
    assert_select "button[data-video-source-target='source']", 0
  end

  test "the preview adds a video and returns to the same list with the flight selected" do
    get preview_flights_path(id: @flight.id, kind: "flight", folder: @folder.id, q: "campaign"), headers: { "Turbo-Frame" => "flight-preview" }
    assert_select ".exds-comments + section[aria-label='Flight videos']" do
      assert_select ".exds-comments-heading", text: "Videos"
      assert_select ".video-status", text: "No video yet. Add one to keep it with this flight."
      assert_select "form.video-upload-form[action=?]", flight_path(@flight) do
        assert_select "input[type='file'][name='flight[video_upload]']", 1
        assert_select "input[type='hidden'][name='return_to_browser'][value='1']", 1
        assert_select "input[type='hidden'][name='folder'][value=?]", @folder.id.to_s
        assert_select "input[type='hidden'][name='q'][value='campaign']", 1
      end
    end

    assert_enqueued_with(job: FlightVideoProcessingJob) do
      patch flight_path(@flight), params: { flight: { video_upload: fixture_file_upload("sample.mp4", "video/mp4") },
        return_to_browser: "1", folder: @folder.id, q: "campaign" }, headers: { "Accept" => "application/json" }
    end
    assert_response :success
    assert_equal flights_path(folder: @folder.id, q: "campaign", selected: "flight:#{@flight.id}"), response.parsed_body["redirect_url"]

    get preview_flights_path(id: @flight.id, kind: "flight"), headers: { "Turbo-Frame" => "flight-preview" }
    assert_select "section[aria-label='Flight videos'] .video-status", text: I18n.t("flights.video.processing")
  end

  test "a reader adds a video from the preview of a flight shared with them" do
    @folder.update!(visibility: "shared", members: [ users(:operator) ])
    sign_in_as users(:operator)
    get preview_flights_path(id: @flight.id, kind: "flight"), headers: { "Turbo-Frame" => "flight-preview" }
    assert_response :success
    assert_select "section[aria-label='Flight videos'] p.video-status", text: I18n.t("flights.video.log_empty")
    assert_select "section[aria-label='Flight videos'] form.video-upload-form[action='#{flight_path(@flight)}']", 1
  end

  test "a flight at Inclined Slovenia has a fan icon beside its location" do
    @flight.update!(environment: "sky", location: "Inclined Slovenia")
    get flights_path(folder: @folder.id)
    assert_select ".exds-browser-entry[data-entry=?]", "flight:#{@flight.id}" do
      assert_select ".exds-browser-entry-copy strong", text: @flight.description
      assert_select ".is-location", text: "Inclined Slovenia"
      assert_select ".is-location > .exds-browser-location-mode[title='Tunnel'] > svg circle", 1
      assert_select ".exds-browser-entry-link[aria-label$=', Tunnel']", 1
    end
  end

  test "flight rows are table rows under a day header, with the flight time instead of the recording length" do
    @flight.update!(duration_seconds: 4786, description: "Test flight", opening_at: @flight.exit_at + 103)
    get flights_path(folder: @folder.id)
    assert_select ".exds-browser-entries[data-local-days='exds-browser-day'] > .exds-browser-table-head[aria-hidden='true'] .exds-browser-table-columns > span", 7
    assert_select ".exds-browser-entries > .exds-browser-day[data-day-header]", text: "Fri 15 May 2026"
    assert_select ".exds-browser-entry[data-entry=?]", "flight:#{@flight.id}" do
      assert_select ".exds-browser-entry-link > *", 7
      assert_select ".exds-browser-entry-meta .status-dot.is-ready", text: "Completed"
      assert_select ".exds-browser-entry-time", text: "20:01"
      assert_select ".exds-browser-entry-copy strong", text: "Test flight"
      assert_select ".exds-browser-entry-link", text: /FLT-/, count: 0
      assert_select ".is-location > .exds-browser-location-mode[title='Sky'] > svg", 1
      assert_select ".exds-browser-cell.is-aircraft", text: @flight.aircraft.registration
      assert_select ".exds-browser-cell.is-location", text: @flight.location
      assert_select ".exds-browser-cell.is-flown", text: "01:43"
    end
    @flight.update!(status: "preparation", started_at: nil, flight_import: nil, aircraft: nil, duration_seconds: nil, exit_at: nil, opening_at: nil, description: "Draft flight")
    get flights_path(folder: @folder.id)
    assert_select ".exds-browser-entry[data-entry=?][data-day-at]", "flight:#{@flight.id}" do
      assert_select ".exds-browser-entry-link > *", 7
      assert_select ".exds-browser-entry-meta .status-dot", text: "Preparation"
      assert_select ".exds-browser-entry-time[title='Creation time'] time[data-local-time='clock'][datetime]", 1
      # A placeholder description names nothing and is not shown as one.
      assert_select ".exds-browser-entry-copy strong", count: 0
      assert_select ".exds-browser-entry-detail", text: "No description"
      assert_select ".exds-browser-cell.is-location", text: @flight.location
      assert_select ".exds-browser-cell.is-aircraft .exds-browser-cell-blank .sr-only", text: "Not recorded"
      assert_select ".exds-browser-cell.is-flown .exds-browser-cell-blank .sr-only", text: "Not recorded"
    end
  end

  test "tunnel flight times of the page come from one query" do
    @flight.update!(environment: "tunnel")
    [ 1, 3.5, 25 ].each { |elapsed| @flight.sensor_samples.create!(sensor_type: "AIRSPEED", elapsed_seconds: elapsed, readings: { differential_pressure_pa: 420 }) }
    queries = []
    counter = ->(*, payload) { queries << payload[:sql] if payload[:sql].include?("sensor_samples") }
    ActiveSupport::Notifications.subscribed(counter, "sql.active_record") { get flights_path(folder: @folder.id) }
    assert_select ".exds-browser-entry[data-entry=?] .exds-browser-cell.is-flown", "flight:#{@flight.id}", text: "00:24"
    assert_equal 1, queries.count { |sql| sql.include?("MIN(elapsed_seconds)") }
  end

  test "the side panels can be put away and the details toggle waits while a panel is open" do
    get flights_path(folder: @folder.id)
    assert_select ".exds-browser-collection-header .exds-browser-panes button[data-flight-browser-target='paneToggle']", 2
    assert_select "button[data-pane='folders'][aria-controls='flight-browser-folders'][aria-expanded='true']"
    assert_select "aside#flight-browser-folders"
    assert_select "button[data-pane='preview'][aria-controls='flight-preview']:not([disabled])"
    get edit_flight_path(@flight)
    assert_select "button[data-pane='preview'][disabled]"
  end

  test "the details pane has a keyboard reachable resize handle on the list edge" do
    get flights_path(folder: @folder.id)
    assert_select ".exds-browser-collection > .exds-browser-resizer[role='separator'][tabindex='0'][aria-orientation='vertical'][aria-controls='flight-preview']" do |handles|
      assert_equal "Resize details", handles.first["aria-label"]
      assert_includes handles.first["data-action"], "keydown->flight-browser#resizeWithKeys"
    end
    assert_select "#flight-preview.exds-browser-preview"
  end

  test "the preview overflow menu deletes the flight and returns to the same folder" do
    @flight.update!(status: "preparation", started_at: nil, flight_import: nil)
    get flights_path(folder: @folder.id, selected: "flight:#{@flight.id}")
    assert_response :success
    assert_select ".exds-browser-preview-actions a[aria-label='Edit flight'] + details.exds-browser-preview-menu" do
      assert_select "summary[aria-label=?]", "More actions for #{@flight.label}"
      assert_select "form[action=?][data-turbo-confirm*=?]", flight_path(@flight, folder: @folder.id, browser: 1), @flight.label do
        assert_select "input[name='_method'][value='delete']"
        assert_select "button", text: /Delete flight/
      end
    end

    assert_difference "Flight.count", -1 do
      delete flight_path(@flight, folder: @folder.id, browser: 1)
    end
    assert_redirected_to flights_path(filter: "flights", folder: @folder.id)
    assert_equal "Flight deleted.", flash[:notice]

    # A flight being recorded is ended from Signal, not deleted from under it.
    live = @owner.flights.create!(name: "Live flight", status: "live", started_at: Time.current, folder: @folder)
    get flights_path(folder: @folder.id, selected: "flight:#{live.id}")
    assert_select ".exds-browser-preview-actions a[aria-label='Edit flight']"
    assert_select "details.exds-browser-preview-menu", count: 0
  end

  test "columns are the only view with direct folder actions and a separate preview frame" do
    get flights_path(folder: @folder.id)
    assert_response :success
    assert_select "turbo-frame#flight-browser"
    assert_select ".exds-browser[data-view=columns]"
    assert_select ".exds-browser-entry[aria-current=true][draggable=true][data-entry=?]", "flight:#{@flight.id}"
    assert_select ".exds-browser-entry-link[draggable=false]"
    assert_select ".exds-browser-preview h2", text: @flight.title
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
    assert_select ".exds-browser-preview h2", text: shared.title
    assert_select ".exds-browser-preview button[aria-label='Move flight']", count: 1
    assert_select ".exds-browser-entry[data-entry=?][draggable=true]", "flight:#{shared.id}"
    assert_not_includes response.body, secret_folder.name
  end

  test "my flights leads the library and lists only the flights piloted by the user" do
    other = flights(:two)
    other.update!(pilot: users(:member), visibility: "team")

    get flights_path
    assert_select ".exds-browser-sidebar nav[aria-label=Library] .exds-browser-nav:first-child[href=?]", flights_path(filter: "mine"), text: /My flights/
    assert_select ".exds-browser-nav[aria-current=page]", text: /All flights/
    assert_select ".exds-browser-entry[data-entry=?]", "flight:#{other.id}"

    get flights_path(filter: "mine")
    assert_select ".exds-browser-nav[aria-current=page]", count: 1, text: /My flights/
    assert_select ".exds-browser-collection h2", text: "My flights"
    assert_select ".exds-browser-entry[data-entry=?]", "flight:#{@flight.id}"
    assert_select ".exds-browser-entry[data-entry=?]", "flight:#{other.id}", count: 0
    assert_select ".exds-browser-entry[data-entry^='import:']", count: 0

    Flight.where(pilot: @owner).update_all(pilot_id: users(:member).id)
    get flights_path(filter: "mine")
    assert_select ".exds-browser-empty strong", text: "No flights of your own yet"
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
    Installation.create!(aircraft: aircraft(:pilatus), installable: create_exofdr_assembly, installed_at: 1.hour.ago)
    assert_difference -> { Flight.count }, 1 do
      post flights_path, params: context.merge(flight: { name: "Campaign draft", flown_on: "2026-10-18", location: "Bouloc", aircraft_id: aircraft(:pilatus).id, folder_id: @folder.id })
    end
    created = @owner.flights.find_by!(name: "Campaign draft")
    assert_redirected_to flights_path(folder: @folder.id, q: "Campaign", selected: "flight:#{created.id}")
    follow_redirect!
    assert_select ".exds-browser-preview-heading h2", text: created.title
    assert_select ".exds-browser-preview-actions a[href=?]", flight_path(created), text: /Open flight/
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
    assert_select ".exds-browser-preview h2", text: "Renamed flight"
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

  test "the flight form shows the FDR installed in the aircraft without letting it be chosen" do
    pilatus = aircraft(:pilatus)
    removed = create_exofdr_assembly
    Installation.create!(aircraft: pilatus, installable: removed, installed_at: 2.hours.ago, removed_at: 90.minutes.ago)
    installed = create_exofdr_assembly
    Installation.create!(aircraft: pilatus, installable: installed, installed_at: 1.hour.ago)

    get new_flight_path, headers: { "Turbo-Frame" => "flight-browser" }
    assert_select "select[name='flight[fdr_id]']", count: 0
    assert_select "fieldset[data-controller='installed-fdr']" do |fieldsets|
      assert_equal({ pilatus.id.to_s => installed.display_name }, JSON.parse(fieldsets.first["data-installed-fdr-installed-value"]))
      assert_equal({ "aircraft" => "", "fdr" => "" }, JSON.parse(fieldsets.first["data-installed-fdr-recorded-value"]))
      assert_select "select[name='flight[aircraft_id]'][data-installed-fdr-target='aircraft'][data-action='change->installed-fdr#show']"
      assert_select "input[disabled][data-installed-fdr-target='fdr'][placeholder='Select an aircraft']:not([name]):not([value])"
    end

    # A saved flight shows its recorded FDR.
    @flight.update!(aircraft: pilatus)
    get edit_flight_path(@flight), headers: { "Turbo-Frame" => "flight-browser" }
    assert_select "input[disabled][data-installed-fdr-target='fdr'][value=?]", installed.display_name
  end

  test "pagination from an editor returns to the collection instead of another form" do
    get new_flight_path(folder: @folder.id, page: 2)
    assert_select ".exds-browser-pagination a[href=?]", flights_path(folder: @folder.id, page: 1), text: "Previous"
    assert_select ".exds-browser-sidebar a[href*='page=']", count: 0
  end
end
