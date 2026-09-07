require "test_helper"

class RecorderIdentityFlowTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:operator)
    @assembly = Assembly.create!(name: "Physical recorder", assembly_type: "ExoFDR", assembly_method: "PERF", fdr_functional_configuration: create_fdr_functional_configuration)
    @ecu = create_embedded_controller(assembly: @assembly, device_id: "ECU-A172E0")
    @ecu.create_signal_presence!(last_seen_at: Time.current, status: {})
  end

  test "Forge shows the physical recorder first and the interchangeable ECU second" do
    label = "#{@assembly.serial_number}"
    get forge_fdrs_path
    assert_response :success
    assert_select "a.workspace-strong-link", text: label
    assert_select "small", text: @ecu.device_id

    [ forge_fdr_path(@ecu), connectivity_forge_fdr_path(@ecu), activity_forge_fdr_path(@ecu) ].each do |path|
      get path
      assert_response :success
      assert_select ".fdr-connectivity-heading h2", text: label
      assert_select ".fdr-connectivity-heading p", text: /#{@ecu.device_id}/
    end
  end

  test "registration and heartbeat resolve the same bench FDR without an aircraft" do
    registration = registered_identity(@ecu)
    get api_v1_fdr_sillage_heartbeats_path, as: :json
    assert_response :success
    heartbeat = response.parsed_body.fetch("heartbeats").first
    assert_equal registration.fetch("assembly"), heartbeat.dig("recorder", "assembly")
    assert_equal @assembly.serial_number, heartbeat.dig("recorder", "assembly", "serial_number")
    assert_equal @ecu.device_id, heartbeat.dig("recorder", "device_id")
    assert_nil heartbeat["aircraft"]
  end

  test "replacing an ECU retains the FDR serial and unassigns the removed endpoint" do
    original = registered_identity(@ecu)
    @ecu.part.remove_from_assembly!
    replacement = create_embedded_controller(assembly: @assembly, device_id: "ECU-F00D01")
    assert_equal original.fetch("assembly"), registered_identity(replacement).fetch("assembly")
    assert_nil registered_identity(@ecu)["assembly"]
    get api_v1_fdr_sillage_heartbeats_path, as: :json
    assert_nil response.parsed_body.fetch("heartbeats").first.dig("recorder", "assembly")
  end

  test "activity snapshots retain the recorder identity after reassignment" do
    activity = @ecu.record_activity!("initialized", source: "forge")
    original_label = activity.recorder_label
    @ecu.part.remove_from_assembly!
    other = Assembly.create!(name: "Other recorder", assembly_type: "ExoFDR", assembly_method: "PERF", fdr_functional_configuration: @assembly.fdr_functional_configuration)
    @ecu.part.install_in!(other)
    assert_equal "#{@assembly.serial_number}", activity.reload.recorder_label
    assert_equal original_label, activity.recorder_label
    assert_not_equal @ecu.reload.display_name, activity.recorder_label
    assert_equal @ecu.device_id, activity.details.dig("recorder_identity", "device_id")
  end

  test "historical identity resolution never uses the current assembly" do
    @ecu.part.remove_from_assembly!
    part = Part.create!(function: @ecu.part.function, model: "Replacement ECU")
    @ecu = create_embedded_controller(part:, device_id: "ECU-F00D01")
    @ecu.part.install_in!(@assembly, at: 4.hours.ago)
    @ecu.part.remove_from_assembly!(at: 2.hours.ago)
    other = Assembly.create!(name: "Other recorder", assembly_type: "ExoFDR", assembly_method: "PERF", fdr_functional_configuration: @assembly.fdr_functional_configuration)
    @ecu.part.install_in!(other)
    identity = @ecu.reload.recorder_identity(at: 3.hours.ago).deep_stringify_keys
    assert_equal @assembly.serial_number, identity.dig("assembly", "serial_number")
    recording = FlightImport.new(import_type: "exofdr", device_id: @ecu.device_id, details: { files: [ { recorder_identity: identity } ] })
    assert_equal "#{@assembly.serial_number}", recording.recorder_label
    recording.details = {}
    assert_equal "Historical FDR identity unavailable", recording.recorder_label
  end

  private

  def registered_identity(controller)
    get api_v1_fdr_registration_path, params: { device_id: controller.device_id }, as: :json
    assert_response :success
    response.parsed_body.fetch("recorder")
  end
end
