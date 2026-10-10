require "test_helper"

class FdrAccessRestorationFlowTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:operator)
    @recorder = create_embedded_controller(assembly: create_exofdr_assembly, device_id: "ECU-ABC123")
    @key = @recorder.fdr_auth_key_encoded
    @recorder.update!(fdr_auth_key_installed_at: 1.day.ago)
    @params = { device_id: @recorder.device_id, confirmed: true, transport: "usb", key_configured: false }
  end

  test "restores the existing key without reopening initialization or changing recorder associations" do
    original = @recorder.attributes
    assert_difference -> { @recorder.device_activities.count }, 1 do
      request_restoration
    end
    assert_response :success
    assert_match "no-store", response.headers["Cache-Control"]
    assert_equal @key, response.parsed_body.dig("authentication", "key")
    assert_equal @recorder.device_id, response.parsed_body["device_id"]
    token = response.parsed_body.fetch("restoration_token")
    assert_equal original, @recorder.reload.attributes
    assert_equal users(:operator), @recorder.device_activities.first.actor

    post api_v1_fdr_initialization_path(@recorder), params: { device_id: @recorder.device_id }, as: :json
    assert_response :conflict
    assert_not_includes response.body, @key

    assert_difference -> { @recorder.device_activities.count }, 1 do
      confirm_restoration(token)
    end
    assert_response :success
    assert_equal "restored", response.parsed_body["status"]
    assert_match "no-store", response.headers["Cache-Control"]
    assert_not_includes response.body, @key
    assert_equal original.except("updated_at", "fdr_auth_key_installed_at"),
      @recorder.reload.attributes.except("updated_at", "fdr_auth_key_installed_at")
    activity = @recorder.device_activities.first
    assert_equal "access_restored", activity.event_type
    assert_equal users(:operator), activity.actor
    assert activity.details["existing_key_preserved"]
    assert_not_includes activity.details.to_json, @key

    get activity_forge_fdr_path(@recorder)
    assert_response :success
    assert_includes response.body, "Recorder access restored"
    assert_includes response.body, "Recorder access restoration requested"
    assert_not_includes response.body, @key

    assert_no_difference -> { @recorder.device_activities.count } do
      confirm_restoration(token)
    end
    assert_response :conflict
  end

  test "requires explicit confirmation and a client report of a keyless USB recorder" do
    [ { confirmed: false }, { confirmed: "true" }, { transport: "ble" }, { key_configured: true }, { key_configured: nil } ].each do |changes|
      assert_no_difference -> { @recorder.device_activities.count } do
        request_restoration(**changes)
      end
      assert_response :unprocessable_entity
      assert_not_includes response.body, @key
      assert @recorder.reload.initialized?
    end
  end

  test "refuses another ECU and never releases the key" do
    request_restoration(device_id: "ECU-F00D01")
    assert_response :conflict
    assert_not_includes response.body, @key
    assert_empty @recorder.device_activities
  end

  test "refuses an uninitialized recorder" do
    @recorder.update!(fdr_auth_key_installed_at: nil)
    request_restoration
    assert_response :conflict
    assert_not_includes response.body, @key
  end

  test "never generates a replacement for a missing or unreadable key" do
    [ nil, "unreadable" ].each do |ciphertext|
      @recorder.update!(fdr_auth_key_ciphertext: ciphertext)
      request_restoration
      assert_response :conflict
      if ciphertext
        assert_equal ciphertext, @recorder.reload.fdr_auth_key_ciphertext
      else
        assert_nil @recorder.reload.fdr_auth_key_ciphertext
      end
      assert_empty @recorder.device_activities
    end
  end

  test "requires an authenticated active account" do
    delete session_path
    request_restoration
    assert_redirected_to new_session_path
    assert_empty @recorder.device_activities

    sign_in_as users(:operator)
    users(:operator).update!(invitation_accepted_at: nil)
    request_restoration
    assert_response :forbidden
    assert_empty @recorder.device_activities
  end

  test "rejects disabled operators and requires administrator two factor verification" do
    users(:operator).update!(disabled_at: Time.current)
    request_restoration
    assert_redirected_to new_session_path
    assert_empty @recorder.device_activities

    sign_in_as users(:julien), otp_verified: false
    request_restoration
    assert_redirected_to new_two_factor_setup_path
    assert_empty @recorder.device_activities
  end

  test "binds confirmation to the authenticated session" do
    request_restoration
    token = response.parsed_body.fetch("restoration_token")
    sign_in_as users(:operator)
    confirm_restoration(token)
    assert_response :conflict
    assert_equal [ "access_restoration_requested" ], @recorder.device_activities.pluck(:event_type)
  end

  test "binds confirmation to the same recorder and existing key" do
    request_restoration
    token = response.parsed_body.fetch("restoration_token")
    other = create_embedded_controller(device_id: "ECU-F00D01")
    patch api_v1_fdr_access_restoration_path(other), params: { device_id: other.device_id, restoration_token: token }, as: :json
    assert_response :conflict
    @recorder.update!(fdr_auth_key_ciphertext: nil)
    @recorder.ensure_fdr_auth_key!
    confirm_restoration(token)
    assert_response :conflict
    assert_equal [ "access_restoration_requested" ], @recorder.device_activities.pluck(:event_type)
  end

  test "rejects expired tampered and missing confirmation tokens" do
    request_restoration
    token = response.parsed_body.fetch("restoration_token")
    [ nil, "invalid", "#{token}changed" ].each do |invalid|
      confirm_restoration(invalid)
      assert_response :conflict
    end
    travel 11.minutes do
      confirm_restoration(token)
      assert_response :conflict
    end
    assert_equal [ "access_restoration_requested" ], @recorder.device_activities.pluck(:event_type)
  end

  private

  def request_restoration(**changes)
    post api_v1_fdr_access_restoration_path(@recorder), params: @params.merge(changes), as: :json
  end

  def confirm_restoration(token)
    patch api_v1_fdr_access_restoration_path(@recorder),
      params: { device_id: @recorder.device_id, restoration_token: token }, as: :json
  end
end
