require "test_helper"

class FdrRegistrationFlowTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:operator) }

  test "reports an unknown physical recorder without creating Hangar data" do
    assert_no_difference -> { Assembly.count } do
      get api_v1_fdr_registration_path, params: { device_id: "exofdr-abc123" }, as: :json
    end

    assert_response :success
    assert_equal({ "registered" => false, "device_id" => "EXOFDR-ABC123" }, response.parsed_body)
  end

  test "registers an identified recorder explicitly and opens its Wi-Fi workspace" do
    assert_difference -> { Assembly.count }, 1 do
      post api_v1_fdr_registration_path, params: {
        device_id: "exofdr-abc123",
        model: "XIAO ESP32S3",
        firmware: "fdr_integrated/26",
        mavlink_system_id: 42,
        mavlink_component_id: 191
      }, as: :json
    end

    assert_response :created
    recorder = Assembly.find_by!(device_id: "EXOFDR-ABC123")
    assert_equal "Integrated FDR · EXOFDR-ABC123", recorder.name
    assert_equal "XIAO ESP32S3", recorder.device_model
    assert_equal "fdr_integrated/26", recorder.last_seen_firmware
    assert_equal 42, recorder.mavlink_system_id
    assert_equal 191, recorder.mavlink_component_id
    assert recorder.last_seen_at
    assert recorder.flight_data_recorder?
    assert_empty recorder.parts
    assert_equal connectivity_hangar_assembly_path(recorder), response.parsed_body.dig("recorder", "connectivity_url")
    assert_equal api_v1_assembly_fdr_initialization_path(recorder), response.parsed_body.dig("recorder", "initialization_url")
    assert_not response.parsed_body.dig("recorder", "initialization_confirmed")
    assert_match "no-store", response.headers["Cache-Control"]
    assert_nil recorder.reload.fdr_auth_key_ciphertext

    get connectivity_hangar_assembly_path(recorder)
    assert_response :success
    assert_select "h2", text: /#{recorder.internal_number}/
    assert_select ".fdr-connectivity-heading", text: /EXOFDR-ABC123/
    assert_select ".fdr-connectivity-heading", text: /XIAO ESP32S3/
  end

  test "registration is idempotent for an already known physical recorder" do
    recorder = Assembly.create!(name: "Known recorder", device_id: "EXOFDR-F00D01")

    assert_no_difference -> { Assembly.count } do
      post api_v1_fdr_registration_path, params: {
        device_id: "EXOFDR-F00D01",
        model: "XIAO ESP32S3",
        firmware: "fdr_integrated/26"
      }, as: :json
    end

    assert_response :success
    assert_not response.parsed_body.fetch("created")
    assert_equal recorder.id, response.parsed_body.dig("recorder", "id")
    assert_equal "fdr_integrated/26", recorder.reload.last_seen_firmware
  end

  test "prepares one stable recorder key only for the exact registered device" do
    recorder = Assembly.create!(name: "Recorder to initialize", device_id: "EXOFDR-ABC123")

    post api_v1_assembly_fdr_initialization_path(recorder),
      params: { device_id: recorder.device_id }, as: :json

    assert_response :success
    assert_match "no-store", response.headers["Cache-Control"]
    first_key = response.parsed_body.dig("authentication", "key")
    assert_operator first_key.bytesize, :>=, 43
    assert_not_nil recorder.reload.fdr_auth_key_ciphertext

    post api_v1_assembly_fdr_initialization_path(recorder),
      params: { device_id: recorder.device_id }, as: :json

    assert_response :success
    assert_equal first_key, response.parsed_body.dig("authentication", "key")

    patch api_v1_assembly_fdr_initialization_path(recorder),
      params: { device_id: recorder.device_id }, as: :json

    assert_response :success
    assert_match "no-store", response.headers["Cache-Control"]
    assert_not_nil recorder.reload.fdr_auth_key_installed_at

    get api_v1_fdr_registration_path, params: { device_id: recorder.device_id }, as: :json
    assert_response :success
    assert response.parsed_body.dig("recorder", "initialization_confirmed")

    post api_v1_assembly_fdr_initialization_path(recorder),
      params: { device_id: recorder.device_id }, as: :json

    assert_response :conflict
    assert_not response.body.include?(first_key)
    assert_includes response.parsed_body.fetch("error"), "already initialized"
  end

  test "refuses to prepare a key for a different physical recorder" do
    recorder = Assembly.create!(name: "Bound recorder", device_id: "EXOFDR-ABC123")

    post api_v1_assembly_fdr_initialization_path(recorder),
      params: { device_id: "EXOFDR-F00D01" }, as: :json

    assert_response :conflict
    assert_nil recorder.reload.fdr_auth_key_ciphertext
    assert_includes response.parsed_body.fetch("error"), recorder.device_id
  end

  test "refuses to confirm initialization before a key is prepared" do
    recorder = Assembly.create!(name: "Recorder without a key", device_id: "EXOFDR-ABC123")

    patch api_v1_assembly_fdr_initialization_path(recorder),
      params: { device_id: recorder.device_id }, as: :json

    assert_response :conflict
    assert_nil recorder.reload.fdr_auth_key_installed_at
  end

  test "finds the exact registered recorder by its physical identity" do
    recorder = Assembly.create!(name: "Known recorder", device_id: "EXOFDR-F00D01")
    installation = Installation.create!(
      aircraft: aircraft(:pilatus),
      installable: recorder,
      installed_at: 2.hours.ago
    )

    get api_v1_fdr_registration_path, params: { device_id: "exofdr-f00d01" }, as: :json

    assert_response :success
    assert response.parsed_body.fetch("registered")
    assert_equal recorder.internal_number, response.parsed_body.dig("recorder", "internal_number")
    assert_equal connectivity_hangar_assembly_path(recorder), response.parsed_body.dig("recorder", "connectivity_url")
    assert_equal aircraft(:pilatus).registration, response.parsed_body.dig("aircraft", "registration")
    assert_equal aircraft(:pilatus).display_name, response.parsed_body.dig("aircraft", "display_name")
    assert_equal installation.installed_at.iso8601, response.parsed_body.dig("aircraft", "installed_at")
  end

  test "keeps the recorder identity when no active aircraft installation exists" do
    Assembly.create!(name: "Bench recorder", device_id: "EXOFDR-BE0C01")

    get api_v1_fdr_registration_path, params: { device_id: "EXOFDR-BE0C01" }, as: :json

    assert_response :success
    assert response.parsed_body.fetch("registered")
    assert_equal "EXOFDR-BE0C01", response.parsed_body.dig("recorder", "device_id")
    assert_nil response.parsed_body["aircraft"]
  end

  test "rejects registration without a physical identity" do
    assert_no_difference -> { Assembly.count } do
      post api_v1_fdr_registration_path, params: { device_id: "" }, as: :json
    end

    assert_response :bad_request
  end
end
