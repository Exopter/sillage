require "test_helper"
require "openssl"

class FdrSillageHeartbeatFlowTest < ActionDispatch::IntegrationTest
  SIGNATURE_DOMAIN = "exopter/fdr/sillage-heartbeat/v1\0".b
  BLE_SESSION_DOMAIN = "exopter/fdr/ble-session/v1\0".b

  setup do
    @recorder = Assembly.create!(
      name: "Connected recorder",
      device_id: "EXOFDR-A172E0"
    )
    @key = @recorder.ensure_fdr_auth_key!
  end

  test "recorder publishes a signed Sillage heartbeat without a browser session" do
    payload = heartbeat_payload.to_json

    post api_v1_fdr_sillage_heartbeat_path,
      params: payload,
      headers: heartbeat_headers(payload)

    assert_response :accepted
    @recorder.reload
    assert_in_delta Time.current, @recorder.last_sillage_seen_at, 2.seconds
    assert_equal "fdr_integrated/26", @recorder.last_seen_firmware
    assert_equal 0x80, @recorder.last_sillage_status.fetch("state_flags")
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

    @recorder.update!(last_sillage_seen_at: 30.seconds.ago)
    get api_v1_fdr_sillage_heartbeats_path, as: :json
    assert_empty response.parsed_body.fetch("heartbeats")
  end

  test "signed-in operator discovers every recorder emitting a fresh signed heartbeat" do
    second_recorder = Assembly.create!(name: "Second connected recorder", device_id: "EXOFDR-ABC123")
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
end
