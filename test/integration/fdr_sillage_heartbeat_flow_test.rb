require "test_helper"
require "openssl"

class FdrSillageHeartbeatFlowTest < ActionDispatch::IntegrationTest
  SIGNATURE_DOMAIN = "exopter/fdr/sillage-heartbeat/v1\0".b
  COMMAND_SIGNATURE_DOMAIN = "exopter/fdr/sillage-command/v1\0".b
  BLE_SESSION_DOMAIN = "exopter/fdr/ble-session/v1\0".b

  setup do
    @recorder = EmbeddedDevice.create!(
      assembly: Assembly.create!(name: "Connected recorder"),
      device_id: "EXOFDR-A172E0"
    )
    @key = @recorder.ensure_fdr_auth_key!
    @recorder.update!(fdr_auth_key_installed_at: Time.current)
  end

  test "recorder publishes a signed Sillage heartbeat without a browser session" do
    payload = heartbeat_payload.to_json

    post api_v1_fdr_sillage_heartbeat_path,
      params: payload,
      headers: heartbeat_headers(payload)

    assert_response :accepted
    @recorder.reload
    presence = @recorder.signal_presence
    assert_in_delta Time.current, presence.last_seen_at, 2.seconds
    assert_equal "fdr_integrated/26", @recorder.last_seen_firmware
    assert_equal 0x80, presence.status.fetch("state_flags")
    assert_equal "uploading", presence.status.dig("wifi_upload", "state")
    assert_equal 65_536, presence.status.dig("wifi_upload", "offset")
  end

  test "rejects unsigned, tampered, and stale Sillage heartbeats" do
    payload = heartbeat_payload.to_json
    post api_v1_fdr_sillage_heartbeat_path, params: payload, headers: { "CONTENT_TYPE" => "application/json" }
    assert_response :unauthorized

    post api_v1_fdr_sillage_heartbeat_path,
      params: payload.sub("integrated/26", "integrated/25"),
      headers: heartbeat_headers(payload)
    assert_response :unauthorized

    stale = heartbeat_payload.merge(sent_at: 2.minutes.ago.to_i).to_json
    post api_v1_fdr_sillage_heartbeat_path, params: stale, headers: heartbeat_headers(stale)
    assert_response :unprocessable_entity
  end

  test "rejects a signature made with the BLE session domain" do
    payload = heartbeat_payload.to_json
    signature = OpenSSL::HMAC.hexdigest("SHA256", @key, BLE_SESSION_DOMAIN + payload)

    post api_v1_fdr_sillage_heartbeat_path,
      params: payload,
      headers: { "CONTENT_TYPE" => "application/json", "X-FDR-Signature" => signature }

    assert_response :unauthorized
  end

  test "signed-in operator discovers only fresh Sillage heartbeats" do
    payload = heartbeat_payload.to_json
    post api_v1_fdr_sillage_heartbeat_path, params: payload, headers: heartbeat_headers(payload)
    sign_in_as users(:operator)

    get api_v1_fdr_sillage_heartbeats_path, as: :json

    assert_response :success
    heartbeats = response.parsed_body.fetch("heartbeats")
    assert_equal [ @recorder.device_id ], heartbeats.map { |heartbeat| heartbeat.dig("recorder", "device_id") }

    @recorder.signal_presence.update!(last_seen_at: 30.seconds.ago)
    get api_v1_fdr_sillage_heartbeats_path, as: :json
    assert_empty response.parsed_body.fetch("heartbeats")
  end

  test "signed-in operator discovers every recorder emitting a fresh signed heartbeat" do
    second_recorder = EmbeddedDevice.create!(device_id: "EXOFDR-ABC123")
    second_key = second_recorder.ensure_fdr_auth_key!

    first_payload = heartbeat_payload.to_json
    second_payload = heartbeat_payload(second_recorder).to_json
    post api_v1_fdr_sillage_heartbeat_path, params: first_payload, headers: heartbeat_headers(first_payload)
    post api_v1_fdr_sillage_heartbeat_path,
      params: second_payload,
      headers: heartbeat_headers(second_payload, second_key)
    sign_in_as users(:operator)

    get api_v1_fdr_sillage_heartbeats_path, as: :json

    assert_response :success
    device_ids = response.parsed_body.fetch("heartbeats").map { |heartbeat| heartbeat.dig("recorder", "device_id") }
    assert_equal [ @recorder.device_id, second_recorder.device_id ].sort, device_ids.sort
  end

  test "operator sends a signed Wi-Fi recording choice and receives the recorder acknowledgement" do
    publish_recording_heartbeat
    sign_in_as users(:operator)

    post api_v1_fdr_recording_commands_path,
      params: { device_id: @recorder.device_id, enabled: false },
      as: :json

    assert_response :accepted
    sequence = response.parsed_body.fetch("sequence")
    command = @recorder.fdr_recording_commands.find(sequence)
    assert_not command.requested_enabled
    assert_equal "pending", command.status

    delivery = heartbeat_payload.merge(
      recording_control: recording_control_payload
    ).to_json
    post api_v1_fdr_sillage_heartbeat_path,
      params: delivery,
      headers: heartbeat_headers(delivery)

    assert_response :accepted
    assert_equal sequence.to_s, response.headers["X-FDR-Command-Sequence"]
    assert_equal "0", response.headers["X-FDR-Recording-Enabled"]
    canonical = [ sequence, 0 ].pack("Q<C")
    assert_equal OpenSSL::HMAC.hexdigest(
      "SHA256", @key, COMMAND_SIGNATURE_DOMAIN + canonical
    ), response.headers["X-FDR-Command-Signature"]

    acknowledgement = heartbeat_payload.merge(
      recording_control: recording_control_payload(
        requested_enabled: false,
        effective_enabled: false,
        last_command_sequence: sequence,
        last_command_result: 0
      )
    ).to_json
    post api_v1_fdr_sillage_heartbeat_path,
      params: acknowledgement,
      headers: heartbeat_headers(acknowledgement)

    assert_response :accepted
    assert_nil response.headers["X-FDR-Command-Sequence"]
    assert_equal "acknowledged", command.reload.status
    assert_equal 0, command.result
    assert command.acknowledged_at

    get api_v1_fdr_sillage_heartbeats_path, as: :json
    exposed = response.parsed_body.fetch("heartbeats").sole.fetch("recording_command")
    assert_equal sequence, exposed.fetch("sequence")
    assert_equal "acknowledged", exposed.fetch("status")
  end

  test "new manual Wi-Fi choice supersedes an unacknowledged choice" do
    publish_recording_heartbeat
    sign_in_as users(:operator)

    post api_v1_fdr_recording_commands_path,
      params: { device_id: @recorder.device_id, enabled: false }, as: :json
    first = @recorder.fdr_recording_commands.find(response.parsed_body.fetch("sequence"))

    post api_v1_fdr_recording_commands_path,
      params: { device_id: @recorder.device_id, enabled: true }, as: :json
    second = @recorder.fdr_recording_commands.find(response.parsed_body.fetch("sequence"))

    assert_equal "superseded", first.reload.status
    assert_equal "pending", second.status
    assert second.requested_enabled
  end

  test "Wi-Fi recording command requires a fresh capable recorder and a boolean choice" do
    sign_in_as users(:operator)

    post api_v1_fdr_recording_commands_path,
      params: { device_id: @recorder.device_id, enabled: false }, as: :json
    assert_response :conflict

    publish_recording_heartbeat
    post api_v1_fdr_recording_commands_path,
      params: { device_id: @recorder.device_id, enabled: "off" }, as: :json
    assert_response :unprocessable_entity
  end

  private

  def heartbeat_payload(recorder = @recorder)
    {
      version: 1,
      device_id: recorder.device_id,
      firmware: "fdr_integrated/26",
      model: "XIAO ESP32S3",
      sent_at: Time.current.to_i,
      uptime_ms: 12_345,
      state_flags: 0x80,
      sensor_validity: 0,
      alert_flags: 0x08,
      storage_free_mib: 0,
      storage_total_mib: 0,
      last_sync_result: 0,
      active_file_index: 0,
      last_synced_file_index: 0,
      wifi_upload: {
        state: "uploading",
        file_index: 1,
        offset: 65_536,
        size_bytes: 131_072,
        last_http_status: 200
      },
      diagnostics: {
        gps_errors: 0,
        imu_errors: 0,
        airspeed_errors: 0,
        storage_write_errors: 1,
        dropped_records: 0
      }
    }
  end

  def heartbeat_headers(payload, key = @key)
    {
      "CONTENT_TYPE" => "application/json",
      "X-FDR-Signature" => OpenSSL::HMAC.hexdigest("SHA256", key, SIGNATURE_DOMAIN + payload)
    }
  end

  def publish_recording_heartbeat
    payload = heartbeat_payload.merge(
      recording_control: recording_control_payload
    ).to_json
    post api_v1_fdr_sillage_heartbeat_path,
      params: payload,
      headers: heartbeat_headers(payload)
    assert_response :accepted
  end

  def recording_control_payload(requested_enabled: true,
                                effective_enabled: true,
                                last_command_sequence: 0,
                                last_command_result: 0)
    {
      requested_enabled:,
      effective_enabled:,
      last_command_sequence:,
      last_command_result:
    }
  end
end
