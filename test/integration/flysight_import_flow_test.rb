require "test_helper"

class FlysightImportFlowTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup { sign_in_as users(:julien) }

  test "imports FlySight V2 files and renders the flight detail" do
    assert_enqueued_jobs 1, only: FlySightImportJob do
      post flight_imports_path, params: {
        flight_import: {
          import_type: "flysight",
          aircraft_id: aircraft(:pilatus).id,
          landing_zone_id: landing_zones(:tournon).id,
          source_files: [
            fixture_file_upload("flysight_v2/TRACK.CSV", "text/csv"),
            fixture_file_upload("flysight_v2/SENSOR.CSV", "text/csv")
          ]
        }
      }
    end

    flight_import = FlightImport.order(:created_at).last
    assert_redirected_to flight_import_path(flight_import)
    assert_equal "pending", flight_import.status
    assert flight_import.source_files.attached?

    follow_redirect!
    assert_response :success
    assert_select "h1", flight_import.source_filename
    assert_select ".status.pending", text: "Pending"

    perform_enqueued_jobs only: FlySightImportJob

    flight = flight_import.reload.flights.first
    assert_equal "imported", flight_import.status

    get flight_path(flight)
    assert_response :success
    assert_select "h1", flight.name
    assert_select ".replay-kit-screen"
    assert_select ".replay-kit-id", text: /\AFLT-\d{4}-\d{3}\z/
    assert_select ".mode-badge", text: "Replay"
    assert_select ".replay-kit-metrics span", text: "Altitude"
    assert_select ".trajectory-scene"
    assert_select ".video-sync"
    assert_select "canvas[data-flight-viewer-target='motionChart']"
    assert_select "canvas.analysis-chart", minimum: 6

    viewer = css_select("[data-controller='flight-viewer']").first
    points = JSON.parse(viewer["data-flight-viewer-points-value"])
    analysis = JSON.parse(viewer["data-flight-viewer-analysis-value"])
    assert_in_delta 802.0, points.first["height"]
    assert_in_delta 0.0, points.last["height"]
    assert_equal "gps", analysis["mode"]
    assert_equal "gps", analysis["altitude_source"]
    assert points.all? { |point| point["t"] >= analysis["replay_start"] && point["t"] <= analysis["replay_end"] }
  ensure
    clear_enqueued_jobs
    clear_performed_jobs
  end

  test "imports FlySight files with JSON upload response" do
    assert_enqueued_jobs 1, only: FlySightImportJob do
      post flight_imports_path,
        params: {
          flight_import: {
            import_type: "flysight",
            aircraft_id: aircraft(:pilatus).id,
            landing_zone_id: landing_zones(:tournon).id,
            source_files: [
              fixture_file_upload("flysight_v2/TRACK.CSV", "text/csv"),
              fixture_file_upload("flysight_v2/SENSOR.CSV", "text/csv")
            ]
          }
        },
        headers: { "ACCEPT" => "application/json" }
    end

    flight_import = FlightImport.order(:created_at).last
    assert_response :created
    assert_equal flight_import_path(flight_import), JSON.parse(response.body).fetch("redirect_url")
    assert_equal "pending", flight_import.status
  ensure
    clear_enqueued_jobs
  end

  test "creates a prepared flight with an aircraft and landing zone" do
    assert_difference -> { Flight.count }, 1 do
      post flights_path, params: {
        flight: {
          name: "Test programme flight",
          aircraft_id: aircraft(:pilatus).id,
          landing_zone_id: landing_zones(:tournon).id
        }
      }
    end

    flight = Flight.order(:created_at).last
    assert_redirected_to flight_path(flight)
    assert_equal "preparation", flight.status
    assert_equal aircraft(:pilatus), flight.aircraft
    assert_equal landing_zones(:tournon), flight.landing_zone
    assert_equal aircraft(:pilatus).configuration_snapshot, flight.configuration_snapshot
  end

  test "rejects a manually prepared flight without an aircraft or landing zone" do
    assert_no_difference -> { Flight.count } do
      post flights_path, params: { flight: { name: "Incomplete prepared flight" } }
    end

    assert_response :unprocessable_entity
    assert_select ".workspace-errors", text: /Aircraft must be selected/
    assert_select ".workspace-errors", text: /Landing zone must be selected/
  end

  test "rejects an ExoFDR import without a source file" do
    assert_no_difference -> { FlightImport.count } do
      post flight_imports_path, params: {
        flight_import: {
          import_type: "exofdr",
          aircraft_id: aircraft(:pilatus).id,
          landing_zone_id: landing_zones(:tournon).id
        }
      }
    end

    assert_redirected_to root_path
    follow_redirect!
    assert_select ".flash.alert", text: "Select an ExoFDR binary file."
  end

  test "dashboard renders the Sillage logbook" do
    flight = Flight.recent.first

    get root_path

    assert_response :success
    assert_select "link[rel='icon'][href='/icon.svg?v=exopter-e'][type='image/svg+xml']"
    assert_select "h1", "Flights"
    assert_sillage_header crumb: "Operations", title: "Flights"
    assert_select ".sillage-mode-switcher", count: 0
    assert_select ".sillage-live-badge", count: 0
    assert_select ".sillage-account-menu"
    assert_select "form[action='#{logout_path}'][method='post'] button", text: "Log out"
    assert_select ".flights-table"
    assert_select ".flights-table tbody tr", minimum: 1
    assert_select ".flights-row[data-controller='row-link'][data-row-link-url-value='#{flight_path(flight)}']"
    assert_select "a[href='#{flights_path}']", text: "Flights"
    assert_select "a[href='#{new_flight_import_path}']", text: "Import data"
    assert_select ".sillage-room-link", text: /Signal/
    assert_select ".sillage-room-link.is-separated", text: /Signal/
    assert_select ".sillage-subtabs .sillage-subtab", 3
    assert_select ".sillage-subtabs .sillage-subtab", text: "Flight prep"
    assert_select ".sillage-subtabs .sillage-subtab", text: "HUD"
    assert_select ".sillage-room-link", text: /Forge/, count: 0

    get forge_path

    assert_response :success
    assert_select "h1", "Builds"
    assert_select ".sillage-breadcrumb [aria-current='page']", text: "Builds"
    assert_select ".workspace-panel"
    assert_select ".room-placeholder-card", count: 0
    assert_select ".reference-layout", count: 0
  end

  test "top breadcrumb follows the current room and tab" do
    flight = flights(:one)

    get new_flight_import_path
    assert_response :success
    assert_sillage_header crumb: "Pre-flight", title: "Import flight data"

    get flight_path(flight)
    assert_response :success
    assert_sillage_header crumb: "Replay & analysis", title: flight.code

    get flight_hud_path
    assert_response :success
    assert_sillage_header crumb: "Pilot display", title: "HUD preview"

    get atlas_path
    assert_response :success
    assert_sillage_header crumb: "Atlas", title: "Landing zones"
  end

  test "logout clears the local session" do
    delete logout_path

    assert_redirected_to new_session_path
    follow_redirect!
    assert_response :success
    assert_select ".flash.notice", text: "Signed out."
  end

  test "french locale falls back to english" do
    get root_path(locale: :fr)

    assert_response :success
    assert_select "html[lang=en]"
    assert_select ".locale-switch", count: 0
  end

  test "uploads a video for web optimization and stores the marked exit point" do
    flight = flights(:one)

    assert_enqueued_jobs 1, only: FlightVideoProcessingJob do
      patch flight_path(flight), params: {
        flight: {
          video_upload: fixture_file_upload("sample.mp4", "video/mp4")
        }
      }
    end

    assert_redirected_to flight_path(flight)
    assert_equal "processing", flight.reload.video_processing_status
    assert flight.video_upload.attached?

    patch flight_path(flight), params: {
      flight: {
        video_exit_offset_seconds: "12.345"
      }
    }

    assert_redirected_to flight_path(flight)
    assert_in_delta 12.345, flight.reload.video_exit_offset_seconds
  ensure
    clear_enqueued_jobs
  end

  test "uploads a video with JSON upload response" do
    flight = flights(:one)

    assert_enqueued_jobs 1, only: FlightVideoProcessingJob do
      patch flight_path(flight),
        params: {
          flight: {
            video_upload: fixture_file_upload("sample.mp4", "video/mp4")
          }
        },
        headers: { "ACCEPT" => "application/json" }
    end

    assert_response :success
    assert_equal flight_path(flight), JSON.parse(response.body).fetch("redirect_url")
    assert_equal "processing", flight.reload.video_processing_status
  ensure
    clear_enqueued_jobs
  end

  test "renders ready video controls with the saved exit offset" do
    flight = flights(:one)
    flight.video.attach(
      io: file_fixture("sample.mp4").open,
      filename: "sample.mp4",
      content_type: "video/mp4"
    )
    flight.update!(
      video_processing_status: "ready",
      video_exit_offset_seconds: 4.2,
      video_duration_seconds: 12.0
    )

    get flight_path(flight)

    assert_response :success
    assert_select "video.flight-video"
    assert_select "button", text: I18n.t("flights.video.mark_exit")
    assert_select ".video-sync-state", text: I18n.t("flights.video.exit_marked", timestamp: "00:04")

    viewer = css_select("[data-controller='flight-viewer']").first
    assert_equal "4.2", viewer["data-flight-viewer-video-exit-offset-value"]
  end

  private

  def assert_sillage_header(crumb:, title:)
    assert_select ".sillage-breadcrumb[aria-label='Breadcrumb']"
    assert_select ".sillage-breadcrumb ol li", 2
    assert_select ".sillage-breadcrumb ol li:nth-child(1) a[href='#{root_path}']", text: "Sillage"
    assert_select ".sillage-breadcrumb ol li:nth-child(2) [aria-current='page']", text: crumb
    assert_select ".sillage-title-block > strong", text: title
  end
end
