require "test_helper"

class FdrUnifiedIdentityTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:operator)
    @assembly = create_exofdr_assembly
    @board = EmbeddedController.create!(device_id: "ECU-E072A1F81D84", device_model: "XIAO ESP32S3")
    @key = @board.ensure_fdr_auth_key!
  end

  test "setup binds hardware directly without creating a controller part" do
    assert_no_difference "Part.count" do
      patch forge_fdr_path(@board), params: { assembly_id: @assembly.id }
    end
    assert_redirected_to forge_fdr_path(@assembly.serial_number)
    assert_equal @assembly, @board.reload.assembly
    assert_equal @key, @board.fdr_auth_key
    assert_nil @board.part
    follow_redirect!
    assert_select ".exds-recorder-heading p", @assembly.serial_number
    assert_select "dd", @assembly.serial_number.downcase
    assert_select "select[name='embedded_controller[part_id]']", count: 0
    assert_select "a[href='#{files_forge_fdr_path(@assembly.serial_number)}']", text: "Recordings"
    assert_select "main", text: /ECU-E072A1F81D84/, count: 0
  end

  test "replacement preserves serial, historical resolution, keys and activity" do
    FdrIdentity::BindBoard.new(assembly: @assembly, controller: @board, at: 2.hours.ago).call
    original_activity = @board.device_activities.first
    incoming = EmbeddedController.create!(device_id: "ECU-E072A1FA3E78")
    incoming_key = incoming.ensure_fdr_auth_key!
    patch forge_fdr_path(@assembly.serial_number), params: { board_id: incoming.id, replace_board: "1" }
    assert_redirected_to forge_fdr_path(@assembly.serial_number)
    assert_equal incoming, @assembly.reload.embedded_controller
    assert_nil @board.reload.assembly
    assert_equal @assembly, @board.assembly_at(1.hour.ago)
    assert_equal @key, @board.fdr_auth_key
    assert_equal incoming_key, incoming.reload.fdr_auth_key
    assert_equal 2, @assembly.fdr_board_installations.count
    assert_equal 1, @assembly.fdr_board_installations.active.count
    get activity_forge_fdr_path(@assembly.serial_number)
    assert_response :success
    assert_select "strong", original_activity.title
    assert_select "strong", "Integrated board replaced"
  end

  test "a second active board and a board already assigned elsewhere are rejected" do
    FdrIdentity::BindBoard.new(assembly: @assembly, controller: @board).call
    incoming = EmbeddedController.create!(device_id: "ECU-010203040506")
    assert_raises ActiveRecord::RecordInvalid do
      FdrIdentity::BindBoard.new(assembly: @assembly, controller: incoming).call
    end
    other = create_exofdr_assembly
    assert_raises ActiveRecord::RecordInvalid do
      FdrIdentity::BindBoard.new(assembly: other, controller: @board).call
    end
    assert_equal @board, @assembly.reload.embedded_controller
    assert_nil other.reload.embedded_controller
  end

  test "activity follows the dated FDR assignment when a board is reused" do
    FdrIdentity::BindBoard.new(assembly: @assembly, controller: @board, at: 3.hours.ago).call
    incoming = EmbeddedController.create!(device_id: "ECU-010203040506")
    FdrIdentity::BindBoard.new(assembly: @assembly, controller: incoming, replace: true, at: 2.hours.ago).call
    other = create_exofdr_assembly
    FdrIdentity::BindBoard.new(assembly: other, controller: @board, at: 1.hour.ago).call
    @board.record_activity!("wifi_profile_added", source: "forge", details: { ssid: "Other FDR network" })

    get activity_forge_fdr_path(@assembly.serial_number)
    assert_response :success
    assert_select "main", text: /Other FDR network/, count: 0
    get activity_forge_fdr_path(other.serial_number)
    assert_select "main", text: /Other FDR network/
  end

  test "signed name uses a separate domain and never replaces the hardware identity" do
    binding = FdrIdentity::BindBoard.new(assembly: @assembly, controller: @board).call
    get api_v1_fdr_registration_path, params: { device_id: @board.device_id }
    assert_response :success
    recorder = response.parsed_body.fetch("recorder")
    identity = recorder.fetch("identity_provisioning")
    command = [ identity.fetch("command") ].pack("H*")
    assert_equal [ 1, binding.id, @assembly.serial_number ], command.unpack("CQ<Z32")
    assert_equal OpenSSL::HMAC.hexdigest("SHA256", @key, FdrIdentity::NameProvisioning::DOMAIN + command), identity.fetch("signature")
    assert_not_equal OpenSSL::HMAC.hexdigest("SHA256", @key, "exopter/fdr/sillage-command/v1\0".b + command), identity.fetch("signature")
    assert_equal @board.device_id, recorder.fetch("device_id")
    assert_equal connectivity_forge_fdr_path(@assembly.serial_number), recorder.fetch("connectivity_url")
  end

  test "FDR pages work before a board has been assigned" do
    [ forge_fdr_path(@assembly.serial_number), parts_forge_fdr_path(@assembly.serial_number),
      files_forge_fdr_path(@assembly.serial_number), calibration_forge_fdr_path(@assembly.serial_number),
      activity_forge_fdr_path(@assembly.serial_number) ].each do |path|
      get path
      follow_redirect! if response.redirect?
      assert_response :success
    end
  end
end
