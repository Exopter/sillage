require "test_helper"
require "openssl"

class FdrModeCommandsFlowTest < ActionDispatch::IntegrationTest
  setup do
    @recorder = create_embedded_controller(assembly: create_exofdr_assembly, device_id: "ECU-441BF685BEC8")
  end

  test "signs a trigger for each environment and binds start and stop to the station flight" do
    sign_in_as users(:julien)
    key = @recorder.ensure_fdr_auth_key!
    @recorder.update!(fdr_auth_key_installed_at: Time.current)
    params = { device_id: @recorder.device_id, boot_id: 123, revision: 7 }
    post api_v1_fdr_flight_commands_path, params: params.merge(operation: "signal"), as: :json
    assert_response :success
    assert_equal [ 1, 123, 7, 0 ], [ response.parsed_body["payload"] ].pack("H*").unpack("CV3")
    %w[sky tunnel].each do |environment|
      post signal_sessions_path, params: { device_id: @recorder.device_id, flight_trigger: "signal", environment: }
      session = users(:julien).signal_sessions.order(:id).last
      assert_equal environment, session.flight.environment
      assert_equal "signal", session.station_metadata["flight_trigger"]
      %w[start stop].each_with_index do |operation, index|
        post api_v1_fdr_flight_commands_path, params: params.merge(operation:, session_uuid: session.uuid, flight_id: 999), as: :json
        assert_response :success
        message = [ index + 2, 123, 7, session.flight_id ].pack("CV3")
        assert_equal message + OpenSSL::HMAC.digest("SHA256", key, Api::V1::FdrModeCommandsController::DOMAIN + message),
          [ response.parsed_body["payload"] ].pack("H*")
      end
      session.update!(status: "completed", ended_at: Time.current)
    end
  end

  test "signs a mode change for one boot with the module's own key" do
    post api_v1_fdr_mode_commands_path, params: { device_id: @recorder.device_id, boot_id: 1234, mode: "ground" }, as: :json
    assert_response :unauthorized

    sign_in_as users(:julien)
    # A module that was never initialized over USB-C holds no key: nothing it would accept can be signed.
    post api_v1_fdr_mode_commands_path, params: { device_id: @recorder.device_id, boot_id: 1234, mode: "ground" }, as: :json
    assert_response :conflict

    key = @recorder.ensure_fdr_auth_key!
    @recorder.update!(fdr_auth_key_installed_at: Time.current)
    post api_v1_fdr_mode_commands_path, params: { device_id: @recorder.device_id, boot_id: 1234, mode: "ground" }, as: :json
    assert_response :success
    assert_match "no-store", response.headers["Cache-Control"]
    payload = [ response.parsed_body.fetch("payload") ].pack("H*")
    message = [ 1, 1234 ].pack("CV")
    assert_equal message + OpenSSL::HMAC.digest("SHA256", key, "exopter/fdr/radio-mode/v1\0".b + message), payload
    assert_equal 37, payload.bytesize
    assert_equal "mode_requested", @recorder.device_activities.reorder(:id).last.event_type

    post api_v1_fdr_mode_commands_path, params: { device_id: @recorder.device_id, boot_id: 1234, mode: "flight" }, as: :json
    assert_equal 0, [ response.parsed_body.fetch("payload") ].pack("H*").getbyte(0)

    post api_v1_fdr_mode_commands_path, params: { device_id: @recorder.device_id, boot_id: 0, mode: "ground" }, as: :json
    assert_response :unprocessable_entity
    post api_v1_fdr_mode_commands_path, params: { device_id: @recorder.device_id, boot_id: 1234, mode: "sleep" }, as: :json
    assert_response :unprocessable_entity
    post api_v1_fdr_mode_commands_path, params: { device_id: "ECU-000000000001", boot_id: 1234, mode: "ground" }, as: :json
    assert_response :not_found
  end
end
