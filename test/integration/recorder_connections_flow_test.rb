require "test_helper"

class RecorderConnectionsFlowTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:operator)
    @recorder = create_embedded_controller(device_id: "ECU-E072A1F81D84", last_seen_firmware: "fdr_integrated/51", last_identified_at: 1.month.ago)
    @observer = SecureRandom.uuid
  end

  test "USB observation refreshes exact identity metadata without changing assignment or security" do
    original = @recorder.attributes.slice("part_id", "fdr_auth_key_ciphertext", "fdr_auth_key_installed_at")
    assert_no_difference [ -> { EmbeddedController.count }, -> { SignalPresence.count } ] do
      report([ observation ])
    end
    assert_response :no_content
    assert_equal "fdr_integrated/57", @recorder.reload.last_seen_firmware
    assert_in_delta Time.current, @recorder.last_identified_at, 1.second
    assert_equal original, @recorder.attributes.slice(*original.keys)
    get "/api/v1/recorder-connections", as: :json
    assert_response :success
    assert_match "no-store", response.headers["Cache-Control"]
    assert_equal [ "usb-c" ], response.parsed_body["recorders"].find { |row| row["device_id"] == @recorder.device_id }["transports"]
    get forge_path
    assert_select "[data-device-id='#{@recorder.device_id}'] [data-recorder-connection]", text: "USB-C"
    assert_select "[data-device-id='#{@recorder.device_id}'] [data-recorder-firmware]", text: "fdr_integrated/57"
  end

  test "disconnect is scoped to one observer and transport" do
    report([ observation ])
    report([ observation.merge(transport: "ble") ], observer: SecureRandom.uuid)
    report([])
    assert_equal [ "ble" ], @recorder.reload.connection_snapshot[:transports]
    travel 16.seconds do
      assert_empty @recorder.reload.connection_snapshot[:transports]
    end
    assert_equal "fdr_integrated/57", @recorder.reload.last_seen_firmware
  end

  test "radio observation cannot authorize Wi-Fi recording commands or overwrite newer metadata" do
    @recorder.update!(last_identified_at: Time.current, last_seen_firmware: "fdr_integrated/58")
    report([ observation.merge(transport: "ground-radio", age_ms: 9000) ])
    assert_equal [ "ground-radio" ], @recorder.reload.connection_snapshot[:transports]
    assert_equal "fdr_integrated/58", @recorder.last_seen_firmware
    post api_v1_fdr_recording_commands_path, params: { device_id: @recorder.device_id, enabled: true }, as: :json
    assert_response :conflict
    assert_nil @recorder.reload.signal_presence
    travel 7.seconds do
      assert_empty @recorder.reload.connection_snapshot[:transports]
    end
  end

  test "signed Wi-Fi presence remains independent from browser disconnection" do
    @recorder.create_signal_presence!(last_seen_at: Time.current, status: {})
    report([ observation ])
    assert_equal [ "usb-c", "wifi" ], @recorder.reload.connection_snapshot[:transports]
    report([])
    assert_equal [ "wifi" ], @recorder.reload.connection_snapshot[:transports]
  end

  test "unknown IDs, stale observations and unsupported transports cannot create presence" do
    assert_no_difference [ -> { EmbeddedController.count }, -> { RecorderConnection.count } ] do
      report([ observation.merge(device_id: "ECU-F81D84"), observation.merge(age_ms: 10001), observation.merge(transport: "wifi") ])
    end
    assert_response :no_content
    report([ "invalid" ])
    assert_response :unprocessable_entity
  end

  test "observations require an authenticated operator" do
    delete session_path
    report([ observation ])
    assert_response :redirect
    assert_empty @recorder.reload.recorder_connections
  end

  private

  def observation
    { device_id: @recorder.device_id, transport: "usb-c", firmware: "fdr_integrated/57", model: "XIAO ESP32S3 Plus", age_ms: 0 }
  end

  def report(observations, observer: @observer)
    patch "/api/v1/recorder-connections", params: { observer_id: observer, observations: }, as: :json
  end
end
