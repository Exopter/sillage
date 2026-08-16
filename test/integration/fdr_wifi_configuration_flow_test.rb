require "test_helper"

class FdrWifiConfigurationFlowTest < ActionDispatch::IntegrationTest
  setup do
    controller_function = Function.find_or_create_by!(code: "CONTROLLER") { |function| function.name = "Recorder controller" }
    storage_function = Function.find_or_create_by!(code: "STORAGE") { |function| function.name = "Recorder storage" }
    @assembly = Assembly.create!(name: "Development Flight Data Recorder")
    Part.create!(
      function: controller_function,
      manufacturer: "Seeed Studio",
      model: "XIAO ESP32S3",
      serial_number: "DEV-CTRL-WIFI",
      assembly: @assembly
    )
    Part.create!(function: storage_function, manufacturer: "SanDisk", model: "High Endurance", assembly: @assembly)
    @credential = WifiCredential.create!(
      created_by: users(:operator),
      ssid: "EXOPTER-LAB",
      security: "wpa3",
      password: "exopter-lab-secret"
    )
    @profile = @assembly.fdr_wifi_profiles.create!(wifi_credential: @credential, position: 0)
  end

  test "operator sees the recorder connectivity workspace without a password" do
    sign_in_as users(:operator)

    get connectivity_hangar_assembly_path(@assembly)

    assert_response :success
    assert_select "h2", text: /#{@assembly.internal_number}/
    assert_select "#saved-wifi-title", "Saved Wi-Fi networks"
    assert_select "[data-wifi-ssid='EXOPTER-LAB']"
    assert_select "button[data-action='fdr-wifi-configuration#connectUsb']", text: "Connect USB-C"
    assert_select "button[data-action='fdr-wifi-configuration#connectBle']", text: "Connect BLE"
    assert_select "button", text: "Apply to recorder"
    assert_select "body", text: /exopter-lab-secret/, count: 0
    assert_select ".sillage-persistent-fdr-connectivity", count: 0
    assert_select ".fdr-recorder-tabs[aria-label='Recorder sections']" do
      assert_select "a[href='#{hangar_assembly_path(@assembly)}']", text: "Overview"
      assert_select "a.is-active[aria-current='page'][href='#{connectivity_hangar_assembly_path(@assembly)}']", text: "Connectivity"
      assert_select "a", text: "Diagnostics", count: 0
    end
  end

  test "recorder overview and connectivity share one stable navigation" do
    sign_in_as users(:operator)

    get hangar_assembly_path(@assembly)

    assert_response :success
    assert_select ".fdr-connectivity"
    assert_select ".fdr-connectivity-heading h2", text: /#{@assembly.internal_number} · #{@assembly.name}/
    assert_select ".fdr-recorder-tabs[aria-label='Recorder sections']" do
      assert_select "a.is-active[aria-current='page'][href='#{hangar_assembly_path(@assembly)}']", text: "Overview"
      assert_select "a[href='#{connectivity_hangar_assembly_path(@assembly)}']", text: "Connectivity"
    end

    get connectivity_hangar_assembly_path(@assembly)

    assert_response :success
    assert_select ".fdr-connectivity-heading h2", text: /#{@assembly.internal_number} · #{@assembly.name}/
    assert_select ".fdr-recorder-tabs[aria-label='Recorder sections']" do
      assert_select "a[href='#{hangar_assembly_path(@assembly)}']", text: "Overview"
      assert_select "a.is-active[aria-current='page'][href='#{connectivity_hangar_assembly_path(@assembly)}']", text: "Connectivity"
    end
  end

  test "operator can assign an already known network to another recorder" do
    replacement = Assembly.create!(name: "Replacement Flight Data Recorder")
    @assembly.parts.includes(:function).each do |part|
      Part.create!(function: part.function, manufacturer: part.manufacturer, model: part.model, assembly: replacement)
    end
    sign_in_as users(:operator)

    post hangar_assembly_fdr_wifi_profiles_path(replacement), params: { wifi_credential_id: @credential.id }

    assert_redirected_to connectivity_hangar_assembly_path(replacement)
    assert_equal @credential, replacement.fdr_wifi_profiles.first.wifi_credential
  end

  test "provisioning bundle is no-store and confirmation marks the exact device" do
    sign_in_as users(:operator)

    post api_v1_assembly_fdr_wifi_provisioning_path(@assembly),
      params: { device_id: "EXOFDR-ABC123" }, as: :json

    assert_response :success
    assert_match "no-store", response.headers["Cache-Control"]
    payload = response.parsed_body
    assert_equal "exopter-lab-secret", payload.dig("profiles", 0, "password")
    assert_equal 6, payload.dig("profiles", 0, "security")
    assert_equal "http://sillage.test/api/v1/fdr-sillage-heartbeat", payload.dig("sillage", "heartbeat_url")
    assert_nil payload["authentication"]
    assert_nil @assembly.reload.fdr_auth_key_ciphertext

    patch api_v1_assembly_fdr_wifi_provisioning_path(@assembly), params: { device_id: "EXOFDR-ABC123" }, as: :json

    assert_response :success
    assert_equal "EXOFDR-ABC123", @profile.reload.last_provisioned_device_id
    assert_equal "EXOFDR-ABC123", @assembly.reload.device_id
    assert_not @profile.pending?
  end

  test "Wi-Fi provisioning never exposes the raw FDR key" do
    @assembly.ensure_fdr_auth_key!
    sign_in_as users(:operator)

    post api_v1_assembly_fdr_wifi_provisioning_path(@assembly),
      params: { device_id: "EXOFDR-ABC123" }, as: :json

    assert_response :success
    assert_nil response.parsed_body["authentication"]
    assert_not_includes response.body, @assembly.fdr_auth_key_encoded
  end

  test "provisioning refuses to install an assembly key on the wrong recorder" do
    @assembly.update!(device_id: "EXOFDR-A172E0")
    sign_in_as users(:operator)

    post api_v1_assembly_fdr_wifi_provisioning_path(@assembly),
      params: { device_id: "EXOFDR-ABC123" }, as: :json

    assert_response :conflict
    assert_nil @assembly.reload.fdr_auth_key_ciphertext
    assert_includes response.parsed_body.fetch("error"), "already bound"
  end

  test "another operator can reuse a credential already stored in Hangar" do
    shared = WifiCredential.create!(created_by: users(:julien), ssid: "PRIVATE", security: "wpa2", password: "private-secret")
    replacement = Assembly.create!(name: "Shared credential recorder")
    @assembly.parts.includes(:function).each do |part|
      Part.create!(function: part.function, manufacturer: part.manufacturer, model: part.model, assembly: replacement)
    end
    sign_in_as users(:operator)

    post hangar_assembly_fdr_wifi_profiles_path(replacement), params: { wifi_credential_id: shared.id }

    assert_redirected_to connectivity_hangar_assembly_path(replacement)
    assert_equal shared, replacement.fdr_wifi_profiles.first.wifi_credential
  end

  test "removing a recorder assignment keeps the reusable Hangar credential" do
    sign_in_as users(:operator)

    delete hangar_assembly_fdr_wifi_profile_path(@assembly, @profile)

    assert_redirected_to connectivity_hangar_assembly_path(@assembly)
    assert_not FdrWifiProfile.exists?(@profile.id)
    assert WifiCredential.exists?(@credential.id)
  end
end
