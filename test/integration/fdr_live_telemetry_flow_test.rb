require "test_helper"
require "openssl"

class FdrLiveTelemetryFlowTest < ActionDispatch::IntegrationTest
  setup do
    @old_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    @recorder = create_embedded_controller(assembly: Assembly.create!(name: "Live recorder"), device_id: "ECU-A172E0")
    @key = @recorder.ensure_fdr_auth_key!
    @session = SignalSession.create!(user: users(:julien), uuid: SecureRandom.uuid, status: "live", started_at: Time.current)
    @packet = [ 1, 1000 ].pack("V2").unpack1("H*") + "fd010203"
  end

  teardown { Rails.cache = @old_cache }

  test "signed Wi-Fi telemetry is transient and available only through an active operator session" do
    post api_v1_fdr_live_telemetry_path, params: { device_id: @recorder.device_id, session_uuid: @session.uuid }, as: :json
    assert_redirected_to new_session_path
    assert_not FdrLiveTelemetry.wanted?(@recorder)
    sign_in_as users(:julien)
    poll
    assert_response :success
    assert_nil response.parsed_body["telemetry"]
    publish
    assert_response :accepted
    assert_equal "1", response.headers["X-FDR-Live"]
    assert_nil @recorder.reload.signal_presence, "live packets must not perform heartbeat database writes"
    poll
    assert_equal @packet, response.parsed_body.dig("telemetry", "packet")
    travel 3.seconds
    poll
    assert_nil response.parsed_body["telemetry"], "old packets cannot revive a lost link"
    travel 16.seconds
    assert_not FdrLiveTelemetry.wanted?(@recorder)
  end

  test "invalid signatures and malformed packets cannot reach the live mailbox" do
    publish(signature: "0" * 64)
    assert_response :unauthorized
    publish(packet: "not-hex")
    assert_response :unprocessable_entity
    publish(packet: "fd" * 513)
    assert_response :unprocessable_entity
    assert_nil FdrLiveTelemetry.poll(@recorder)
  end

  test "completed or inaccessible sessions cannot start a Wi-Fi lease" do
    sign_in_as users(:julien)
    @session.update!(status: "completed", ended_at: Time.current)
    poll
    assert_response :conflict
    assert_not FdrLiveTelemetry.wanted?(@recorder)
    post api_v1_fdr_live_telemetry_path, params: { device_id: @recorder.device_id, session_uuid: SecureRandom.uuid }, as: :json
    assert_response :not_found
  end

  private

  def poll
    post api_v1_fdr_live_telemetry_path, params: { device_id: @recorder.device_id, session_uuid: @session.uuid }, as: :json
  end

  def publish(packet: @packet, signature: nil)
    body = { version: 1, device_id: @recorder.device_id, sent_at: Time.current.to_i, live_telemetry: packet }.to_json
    signature ||= OpenSSL::HMAC.hexdigest("SHA256", @key, "exopter/fdr/sillage-heartbeat/v1\0".b + body)
    post api_v1_fdr_sillage_heartbeat_path, params: body, headers: { "CONTENT_TYPE" => "application/json", "X-FDR-Signature" => signature }
  end
end
