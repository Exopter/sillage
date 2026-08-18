require "test_helper"

class SignalFlowTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:julien)
    @asset = Assembly.create!(name: "Signal FDR")
    @fdr = EmbeddedDevice.create!(
      assembly: @asset,
      mavlink_system_id: 1,
      mavlink_component_id: 191
    )
    Installation.create!(aircraft: aircraft(:pilatus), installable: @asset, installed_at: 1.hour.ago)
  end

  test "creates an idempotent live session and completes its flight" do
    flight = flights(:one)
    flight.update!(status: "preparation")
    uuid = SecureRandom.uuid

    post api_v1_signal_sessions_path, params: { uuid:, flight_id: flight.id, started_at: Time.current.iso8601 }, as: :json

    assert_response :created
    session = SignalSession.find_by!(uuid:)
    assert_equal flight, session.flight
    assert_equal "live", flight.reload.status

    payload = {
      sequence: 0,
      first_received_at: Time.current.iso8601,
      last_received_at: Time.current.iso8601,
      mavlink_system_id: @fdr.mavlink_system_id,
      mavlink_component_id: @fdr.mavlink_component_id,
      position: { latitude: 44.1994, longitude: 5.7168 },
      samples: [
        { kind: "gps", recorded_at: Time.current.iso8601, latitude: 44.1994, longitude: 5.7168, altitude_m: 1_480, heading_deg: 36, gps_fix: 3, satellite_count: 12 },
        { kind: "sensor", sensor_type: "VFR_HUD", recorded_at: Time.current.iso8601, readings: { airspeedMps: 59.4 } }
      ]
    }

    assert_difference -> { session.signal_batches.count }, 1 do
      assert_difference -> { flight.track_points.count }, 1 do
        assert_difference -> { flight.sensor_samples.count }, 1 do
          post batches_api_v1_signal_session_path(uuid), params: payload, as: :json
          assert_response :success
        end
      end
    end
    assert_equal 0, response.parsed_body.fetch("acknowledged_sequence")
    assert_equal 1, session.reload.mavlink_system_id
    assert_equal 191, session.mavlink_component_id

    assert_no_difference -> { session.signal_batches.count } do
      assert_no_difference -> { flight.track_points.count } do
        post batches_api_v1_signal_session_path(uuid), params: payload, as: :json
        assert_response :success
      end
    end

    event_uuid = SecureRandom.uuid
    assert_difference -> { session.operator_events.count }, 1 do
      post events_api_v1_signal_session_path(uuid), params: { event_uuid:, label: "Operator marker" }, as: :json
      assert_response :created
    end
    assert_no_difference -> { session.operator_events.count } do
      post events_api_v1_signal_session_path(uuid), params: { event_uuid:, label: "Operator marker" }, as: :json
      assert_response :created
    end

    patch complete_api_v1_signal_session_path(uuid), params: { ended_at: Time.current.iso8601 }, as: :json

    assert_response :success
    assert_equal "completed", session.reload.status
    assert_equal "processing", flight.reload.status
  end

  test "a first live batch identifies an unassigned aircraft" do
    post api_v1_signal_sessions_path, params: { uuid: SecureRandom.uuid }, as: :json
    session = SignalSession.order(:created_at).last
    assert_nil session.flight.aircraft

    post batches_api_v1_signal_session_path(session.uuid), params: {
      sequence: 0,
      mavlink_system_id: @fdr.mavlink_system_id,
      mavlink_component_id: @fdr.mavlink_component_id,
      samples: []
    }, as: :json

    assert_response :success
    assert_equal aircraft(:pilatus), session.flight.reload.aircraft
  end

  test "a prepared flight learns the observed MAVLink identity for its installed FDR" do
    asset = Assembly.create!(name: "Unidentified FDR")
    fdr = EmbeddedDevice.create!(assembly: asset)
    Installation.create!(aircraft: aircraft(:exowing), installable: asset, installed_at: 1.hour.ago)
    flight = flights(:two)
    flight.update!(status: "preparation")
    uuid = SecureRandom.uuid

    post api_v1_signal_sessions_path, params: { uuid:, flight_id: flight.id }, as: :json
    post batches_api_v1_signal_session_path(uuid), params: {
      sequence: 0,
      mavlink_system_id: 42,
      mavlink_component_id: 191,
      samples: []
    }, as: :json

    assert_response :success
    assert_equal 42, fdr.reload.mavlink_system_id
    assert_equal 191, fdr.mavlink_component_id
    assert_equal 42, SignalSession.find_by!(uuid:).mavlink_system_id
    assert_equal({ "system_id" => 42, "component_id" => 191 }, flight.reload.configuration_snapshot.dig("installations", 0, "asset", "embedded_device", "mavlink"))
  end

  test "an ambiguous MAVLink system does not select an aircraft" do
    second_asset = Assembly.create!(name: "Second Signal FDR")
    EmbeddedDevice.create!(
      assembly: second_asset,
      mavlink_system_id: 1,
      mavlink_component_id: 191
    )
    Installation.create!(aircraft: aircraft(:exowing), installable: second_asset, installed_at: 1.hour.ago)

    post api_v1_signal_sessions_path, params: { uuid: SecureRandom.uuid }, as: :json
    session = SignalSession.order(:created_at).last
    post batches_api_v1_signal_session_path(session.uuid), params: {
      sequence: 0,
      mavlink_system_id: 1,
      mavlink_component_id: 191,
      samples: []
    }, as: :json

    assert_response :success
    assert_nil session.flight.reload.aircraft
  end

  test "renders the unified Signal workspace without view tabs" do
    flight = flights(:one)
    session = users(:julien).signal_sessions.create!(flight:)

    get signal_path(session: session.uuid)

    assert_response :success
    assert_select ".signal-widget[data-widget='map']"
    assert_select ".signal-widget[data-widget='instruments']"
    assert_select ".signal-widget[data-widget='charts']"
    assert_select ".signal-mode-buttons button", text: "Large", minimum: 3
    assert_select ".signal-telemetry-strip", count: 1
    assert_select ".signal-tabs", count: 0
  end

  test "renders uniform recorder connections and combined information in Forge" do
    controller_function = Function.find_or_create_by!(code: "CONTROLLER") { |function| function.name = "Recorder controller" }
    storage_function = Function.find_or_create_by!(code: "STORAGE") { |function| function.name = "Recorder storage" }
    Part.create!(function: controller_function, manufacturer: "Seeed Studio", model: "XIAO ESP32S3", assembly: @asset)
    Part.create!(function: storage_function, manufacturer: "SanDisk", model: "High Endurance", assembly: @asset)

    get forge_fdrs_path

    assert_response :success
    assert_select ".workspace-table", text: /Model not reported/, count: 0
    assert_select "#aircraft-connection-indicator.aircraft-connection-pill[data-turbo-permanent][data-controller='aircraft-connection-indicator'][data-aircraft-connection-state='disconnected']"
    assert_select "#aircraft-connection-indicator[data-turbo='false']", count: 0
    assert_select "[data-aircraft-connection-indicator-target='label']", text: "No aircraft connected"
    assert_select "[data-aircraft-connection-indicator-target='icon'][hidden]", count: 4
    assert_select "#sillage-fdr-connectivity[data-controller='fdr-connectivity'][data-fdr-connectivity-registration-url-value='#{api_v1_fdr_registration_path}'][data-fdr-connectivity-authentication-url-value='#{api_v1_fdr_authentication_path}'][data-fdr-connectivity-sillage-heartbeat-url-value='#{api_v1_fdr_sillage_heartbeats_path}']"
    assert_select "#sillage-fdr-connectivity[data-turbo-permanent]", count: 0
    assert_select "#sillage-fdr-connectivity[data-fdr-connectivity-expected-device-id-value]", count: 0
    assert_select ".sillage-persistent-fdr-connectivity", count: 0
    assert_select ".signal-fdr-transport", count: 3
    assert_select ".signal-fdr-channel-head.signal-fdr-channel-head--usb", count: 1
    assert_select ".signal-fdr-channel-identity .signal-k", text: /\AUSB-C\z/, count: 1
    assert_select "button.signal-tool-button:not(.is-primary)[data-action='fdr-connectivity#connectUsb']", text: "Connect USB-C"
    assert_select "button[data-action='fdr-connectivity#connectBle']", text: "Connect BLE"
    assert_select "button.signal-tool-button.signal-fdr-auto-label[data-fdr-connectivity-target='wifiAutoLabel'][aria-label='Automatic Wi-Fi connection: waiting for signed Sillage heartbeat'][disabled]", text: "Automatic"
    assert_select "[data-fdr-connectivity-target='wifiStatus']", text: "Not connected"
    assert_select "[data-fdr-connectivity-target='wifiDevice']", text: "No recorder detected"
    assert_select ".signal-fdr-transport-meta", count: 0
    assert_select ".signal-fdr-capabilities", count: 3
    assert_select ".signal-fdr-capabilities-trigger[aria-describedby]", count: 3
    assert_select ".signal-fdr-capabilities-tooltip[role='tooltip']", count: 3
    assert_select ".signal-fdr-capabilities-tooltip > span", text: "Capabilities", count: 3
    assert_select ".signal-fdr-capabilities-tooltip li", count: 5
    assert_select ".signal-fdr-capabilities-tooltip", text: /Telemetry synchronization/, count: 1
    assert_select ".signal-fdr-capabilities-trigger[aria-label='USB-C capabilities'][aria-describedby='usb-capabilities-tooltip']"
    assert_select "#usb-capabilities-tooltip[role='tooltip']"
    assert_select ".signal-fdr-capabilities-trigger[aria-label='Bluetooth Low Energy capabilities'][aria-describedby='ble-capabilities-tooltip']"
    assert_select "#ble-capabilities-tooltip[role='tooltip']"
    assert_select ".signal-fdr-capabilities-trigger[aria-label='Wi-Fi capabilities'][aria-describedby='wifi-capabilities-tooltip']"
    assert_select "#wifi-capabilities-tooltip[role='tooltip']"
    usb_feedback_children = css_select(".signal-fdr-transport:first-of-type .signal-fdr-transport-feedback > *")
    assert_equal [
      "signal-fdr-device-row",
      "syncProgress",
      "usbNotice"
    ], usb_feedback_children.map { |node| node["data-fdr-connectivity-target"] || node["class"] }
    ble_feedback_children = css_select(".signal-fdr-transport:nth-of-type(2) .signal-fdr-transport-feedback > *")
    assert_equal [
      "signal-fdr-device-row",
      "bleNotice"
    ], ble_feedback_children.map { |node| node["data-fdr-connectivity-target"] || node["class"] }
    wifi_feedback_children = css_select(".signal-fdr-transport:nth-of-type(3) .signal-fdr-transport-feedback > *")
    assert_equal [
      "signal-fdr-device-row",
      "wifiNotice"
    ], wifi_feedback_children.map { |node| node["data-fdr-connectivity-target"] || node["class"] }
    assert_select "[data-fdr-connectivity-target='usbNotice'][data-state='status'][role='status'][hidden]"
    assert_select "[data-fdr-connectivity-target='bleNotice'][data-state='status'][role='status'][hidden]"
    assert_select "[data-fdr-connectivity-target='syncDetail'][hidden]"
    assert_select "[data-fdr-connectivity-target='bleDetail'][hidden]"
    assert_select "[data-fdr-connectivity-target='wifiNotice'][data-state='status'][role='status'][hidden]"
    assert_select "[data-fdr-connectivity-target='wifiDetail'][hidden]", text: ""
    assert_select ".signal-fdr-overview [data-fdr-connectivity-target='recorderDevice']", text: "No recorder identified"
    assert_select "span[data-fdr-connectivity-target='recorderStatus'][hidden]"
    assert_select "[data-fdr-connectivity-target='recorderSource'][hidden]"
    assert_select "[data-fdr-connectivity-target='recorderAlert'][hidden]"
    assert_select "[data-fdr-connectivity-target='recorderAlertTechnical'][hidden]"
    assert_select ".signal-fdr-status-list > div", count: 6
    assert_select ".signal-fdr-tools", count: 1
    assert_select "select[data-fdr-connectivity-target='configInterval'][disabled]"
    assert_select "button[data-fdr-connectivity-target='configButton'][disabled]"
    assert_select "button[data-fdr-connectivity-target='debugButton'][disabled]"
    assert_select ".signal-fdr-wifi-entry a[data-fdr-connectivity-target='wifiLink'][href='#{forge_fdrs_path}']", text: /Select recorder/
    assert_select "[data-fdr-connectivity-target='wifiDescription']", text: /Manage saved networks/
    assert_select "[data-fdr-connectivity-target='recorderOnboarding'][hidden]" do
      assert_select "[data-fdr-connectivity-target='recorderOnboardingTitle']", text: "New recorder detected"
      assert_select "button[data-action='fdr-connectivity#onboardRecorder'][data-fdr-connectivity-target='wifiRegisterButton']", text: /Add and initialize recorder/
      assert_select "[data-fdr-connectivity-target='wifiRegistrationStatus']"
    end
    assert_select "progress[data-fdr-connectivity-target='syncProgress'][hidden]"
    assert_select "[data-fdr-connectivity-target='syncTechnical'][hidden]"
    assert_select "details[data-fdr-connectivity-target='recorderTools']:not([open])"
  end

  test "Signal home excludes the visible FDR configuration manager" do
    get signal_path

    assert_response :success
    assert_select ".signal-home #sillage-fdr-connectivity", count: 0
    assert_select "#sillage-fdr-connectivity", count: 0
  end

  test "does not keep the recorder connection manager outside Forge" do
    get flights_path

    assert_response :success
    assert_select "#aircraft-connection-indicator[data-turbo-permanent]"
    assert_select "#sillage-fdr-connectivity", count: 0
  end
end
