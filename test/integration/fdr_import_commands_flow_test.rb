require "test_helper"
require "openssl"

class FdrImportCommandsFlowTest < ActionDispatch::IntegrationTest
  setup do
    @recorder = create_embedded_controller(assembly: Assembly.create!(name: "Import queue recorder"), device_id: "ECU-B12345")
    @key = @recorder.ensure_fdr_auth_key!
    @queue = { version: 1, boot_id: 421, revision: 1, paused: false, command_sequence: 0, command_result: 0,
      before_index: 0, next_before_index: 0, files: [ { file_index: 5, boot_id: 200, size_bytes: 1234, flags: 0 } ] }
  end

  test "only a signed-in operator can request a selection from a fresh capable recorder" do
    publish
    post api_v1_fdr_import_commands_path, params: command_params, as: :json
    assert_response :redirect
    sign_in_as users(:operator)
    @recorder.signal_presence.update!(last_seen_at: 1.minute.ago)
    assert_no_difference "FdrImportCommand.count" do
      post api_v1_fdr_import_commands_path, params: command_params, as: :json
      assert_response :conflict
    end
  end

  test "commands are signed for this boot and repeated until an acknowledgement arrives" do
    publish
    sign_in_as users(:operator)
    post api_v1_fdr_import_commands_path, params: command_params, as: :json
    assert_response :created
    command = FdrImportCommand.find(response.parsed_body.fetch("id"))
    publish
    wire = [ response.headers.fetch("X-FDR-Import-Command") ].pack("H*")
    assert_equal 33, wire.bytesize
    assert_equal "IMPORT1\0".b, wire[0, 8]
    assert_equal [ command.id, 421, command.expires_at.to_i, 1, 5, 200 ], wire[8..].unpack("Q<L<L<CL<L<")
    signature = OpenSSL::HMAC.hexdigest("SHA256", @key, "exopter/fdr/sillage-command/v1\0".b + wire)
    assert_equal signature, response.headers["X-FDR-Import-Signature"]
    publish
    assert_equal wire.unpack1("H*"), response.headers["X-FDR-Import-Command"]
    publish(command_sequence: command.id)
    assert_equal "acknowledged", command.reload.status
    assert_nil response.headers["X-FDR-Import-Command"]
  end

  test "a reboot and expiration invalidate queued selections" do
    publish
    sign_in_as users(:operator)
    post api_v1_fdr_import_commands_path, params: command_params, as: :json
    old = FdrImportCommand.last
    publish(boot_id: 422)
    assert_equal "expired", old.reload.status
    assert_nil response.headers["X-FDR-Import-Command"]
    post api_v1_fdr_import_commands_path, params: command_params, as: :json
    expired = FdrImportCommand.last
    expired.update!(expires_at: 1.second.ago)
    publish(boot_id: 422)
    assert_equal "expired", expired.reload.status
    assert_nil response.headers["X-FDR-Import-Command"]
  end

  test "recorder refusals are visible and malformed requests do not queue commands" do
    publish
    sign_in_as users(:operator)
    post api_v1_fdr_import_commands_path, params: command_params, as: :json
    command = FdrImportCommand.last
    publish(command_sequence: command.id, command_result: 1)
    assert_equal "failed", command.reload.status
    get api_v1_fdr_import_commands_path, params: { device_id: @recorder.device_id }, as: :json
    assert_equal "failed", response.parsed_body.fetch("commands").first.fetch("status")
    [ { action_name: "delete" }, { file_index: -1 }, { file_index: 5.5 }, { file_boot_id: 0x1_0000_0000 },
      { action_name: "pause" }, { action_name: "catalog", file_boot_id: 1 } ].each do |invalid|
      assert_no_difference "FdrImportCommand.count" do
        post api_v1_fdr_import_commands_path, params: command_params.merge(invalid), as: :json
        assert_response :unprocessable_entity
      end
    end
  end

  test "malformed or tampered queue metadata never replaces the catalogue" do
    publish
    publish(files: Array.new(9, @queue[:files].first), expected: :unprocessable_entity)
    assert_equal 1, @recorder.reload.signal_presence.status.fetch("import_queue").fetch("files").size
    body = payload(@queue).to_json
    post api_v1_fdr_sillage_heartbeat_path, params: body.sub('"size_bytes":1234', '"size_bytes":9999'), headers: headers(body)
    assert_response :unauthorized
  end

  test "recording duration is retained and unknown stays distinct from zero" do
    [ 29_520_000, 0, nil ].each do |duration|
      publish(files: [ @queue[:files].first.merge(duration_ms: duration) ])
      stored = @recorder.reload.signal_presence.status.fetch("import_queue").fetch("files").first
      if duration.nil?
        assert_nil stored.fetch("duration_ms")
      else
        assert_equal duration, stored.fetch("duration_ms")
      end
    end
    [ -1, "3600", 1.5 ].each do |invalid|
      publish(files: [ @queue[:files].first.merge(duration_ms: invalid) ], expected: :unprocessable_entity)
    end
    publish # Earlier firmware can omit the optional duration.
  end

  private

  def command_params
    { device_id: @recorder.device_id, action_name: "priority", file_index: 5, file_boot_id: 200 }
  end

  def payload(queue)
    { version: 1, device_id: @recorder.device_id, sent_at: Time.current.to_i, firmware: "fdr_integrated/59", model: "XIAO ESP32S3", import_queue: queue }
  end

  def headers(body)
    { "CONTENT_TYPE" => "application/json", "X-FDR-Signature" => OpenSSL::HMAC.hexdigest("SHA256", @key, "exopter/fdr/sillage-heartbeat/v1\0".b + body) }
  end

  def publish(expected: :accepted, **attributes)
    body = payload(@queue.merge(attributes)).to_json
    post api_v1_fdr_sillage_heartbeat_path, params: body, headers: headers(body)
    assert_response expected
  end
end
