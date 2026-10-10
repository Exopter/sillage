require "test_helper"

class FdrFullIdentityTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:operator)
    @legacy = create_embedded_controller(device_id: "ECU-A172E0")
  end

  test "same manufacturer boards register separately without adopting legacy inventory" do
    ids = %w[ECU-E072A1F81D84 ECU-E072A1FA3E78]
    ids.each do |id|
      get api_v1_fdr_registration_path, params: { device_id: id }, as: :json
      assert_equal false, response.parsed_body["registered"]
      post api_v1_fdr_registration_path, params: { device_id: id, firmware: "fdr_integrated/57" }, as: :json
      assert_response :created
      assert_equal id, response.parsed_body.dig("recorder", "device_id")
      assert_nil response.parsed_body.dig("recorder", "assembly")
    end
    assert_equal 2, EmbeddedController.where(device_id: ids).count
    assert_equal "ECU-A172E0", @legacy.reload.device_id
    %w[ECU-A ECU-1234567 ECU-12345678901 ECU-1234567890123 ECU-G072A1F81D84].each do |id|
      assert_not FdrIdentity::DeviceId.valid?(id)
    end
  end

  test "explicit correction preserves keys and history but invalidates old calibration" do
    key = @legacy.ensure_fdr_auth_key!
    @legacy.update!(fdr_auth_key_installed_at: Time.current)
    activity = @legacy.record_activity!("initialized", source: "forge")
    function = Function.find_or_create_by!(code: "CONTROLLER") { |f| f.name = "Controller" }
    @legacy.update!(part: Part.create!(function:, manufacturer: "Seeed", model: "S3"))
    original_part = @legacy.part_id
    check = @legacy.imu_checks.create!(user: users(:operator), uuid: SecureRandom.uuid,
      kind: "calibration", outcome: "passed", firmware: "fdr_integrated/56", boot_id: 42, imu_epoch: 1,
      configuration_digest: ImuCheck.configuration_digest_for(@legacy),
      evidence: { samples: [ { accuracy: [ 3, 0, 3, 3 ] } ] }, summary: { limits_version: Imu::Assessment::LIMITS_VERSION })
    assert ImuCheck.reference_for(@legacy, firmware: "fdr_integrated/56")
    args = { recorder: @legacy, hardware_mac: "e0:72:a1:f8:1d:84", actor: users(:operator), evidence: "USB hardware MAC checked against the labelled original board." }
    FdrIdentity::Reidentify.call(**args)
    assert_equal "ECU-E072A1F81D84", @legacy.reload.device_id
    assert_equal "ECU-F81D84", @legacy.technical_reference
    get calibration_forge_fdr_path(@legacy)
    assert_response :success
    assert_select "title", text: /ECU-F81D84/
    assert_select "[data-imu-check-device-value='ECU-E072A1F81D84']"
    assert_equal key, @legacy.fdr_auth_key
    assert @legacy.initialized?
    assert_equal original_part, @legacy.part_id
    assert_equal "ECU-A172E0", activity.reload.details.dig("recorder_identity", "device_id")
    assert_equal "passed", check.reload.outcome
    assert_equal "ECU-A172E0", check.evidence["device_id"]
    assert_equal [ 3, 0, 3, 3 ], check.evidence["samples"].first["accuracy"]
    assert check.invalidated_at
    assert_nil ImuCheck.reference_for(@legacy, firmware: "fdr_integrated/56")
    assert_no_difference "DeviceActivity.count" do
      FdrIdentity::Reidentify.call(**args)
    end
    post api_v1_fdr_authentication_path, params: { device_id: @legacy.device_id, transport: "usb", nonce: "12" * 16 }, as: :json
    assert_response :success
    assert_equal OpenSSL::HMAC.hexdigest("SHA256", key, "exopter/fdr/usb-session/v1\0".b + [ "12" * 16 ].pack("H*")), response.parsed_body["proof"]
  end

  test "correction refuses occupied identities and unrelated hardware without partial updates" do
    args = { recorder: @legacy, hardware_mac: "e0:72:a1:fa:3e:78", actor: users(:operator), evidence: "Physical board checked." }
    create_embedded_controller(device_id: "ECU-E072A1FA3E78")
    assert_raises(ArgumentError) { FdrIdentity::Reidentify.call(**args) }
    assert_raises(ArgumentError) { FdrIdentity::Reidentify.call(**args.merge(hardware_mac: "01:02:03:04:05:06")) }
    assert_raises(ArgumentError) { FdrIdentity::Reidentify.call(**args.merge(evidence: "")) }
    assert_equal "ECU-A172E0", @legacy.reload.device_id
    assert_empty @legacy.device_activities
  end
end
