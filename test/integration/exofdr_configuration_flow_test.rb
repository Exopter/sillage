require "test_helper"

class ExofdrConfigurationFlowTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:operator) }

  test "configuration catalogue is separate from core inventory and supports CRUD until used" do
    get hangar_fdr_functional_configurations_path
    assert_response :success
    assert_select "nav[aria-label='Hangar inventory'] a", count: 3
    assert_select "nav[aria-label='Hangar inventory']", text: /Functions/, count: 0
    assert_select "nav[aria-label='Hangar configuration'] a", count: 2
    assert_select ".workspace-empty", /No functional configurations yet/

    post hangar_fdr_functional_configurations_path, params: { fdr_functional_configuration: { version: 42, planned_capabilities: "Recording and telemetry" } }
    configuration = FdrFunctionalConfiguration.find_by!(version: 42)
    assert_redirected_to hangar_fdr_functional_configuration_path(configuration)
    follow_redirect!
    assert_select ".workspace-empty", "No assemblies use this configuration yet."

    patch hangar_fdr_functional_configuration_path(configuration), params: { fdr_functional_configuration: { planned_capabilities: "GNSS recording" } }
    assert_equal "GNSS recording", configuration.reload.planned_capabilities
    delete hangar_fdr_functional_configuration_path(configuration)
    assert_redirected_to hangar_fdr_functional_configurations_path
    assert_not FdrFunctionalConfiguration.exists?(configuration.id)
  end

  test "creation requires a type and previews selectable capabilities without asking for a name" do
    configuration = create_fdr_functional_configuration(version: 42, planned_capabilities: "Recording and telemetry")
    get new_hangar_assembly_path
    assert_select "select[name='assembly[assembly_type]'] option", count: 2
    assert_select "input[name='assembly[name]'], input[name='assembly[serial_number]'], select[name='assembly[hardware_definition_id]']", count: 0
    assert_select "table.workspace-choice-table", text: /V42.*Recording and telemetry/m

    assert_no_difference -> { Assembly.count } do
      post hangar_assemblies_path, params: { assembly: { name: "Bypass type" } }
      assert_response :unprocessable_entity
      post hangar_assemblies_path, params: { assembly: { assembly_type: "ExoFDR", fdr_functional_configuration_id: configuration.id } }
      assert_response :unprocessable_entity
    end

    2.times do |index|
      post hangar_assemblies_path, params: { assembly: { assembly_type: "ExoFDR", fdr_functional_configuration_id: configuration.id, assembly_method: "PERF", name: "Ignored" } }
      assembly = Assembly.order(:id).last
      assert_redirected_to hangar_assembly_path(assembly)
      assert_equal format("EXOFDR-V42-PERF-%02d", index + 1), assembly.name
      assert_equal assembly.name, assembly.serial_number
      follow_redirect!
      assert_select ".workspace-header h2", assembly.name
      assert_select ".workspace-header", text: /S\/N|Hardware definition/, count: 0
    end
  end

  test "used configuration and assembly parameters cannot be changed through requests" do
    assembly = create_exofdr_assembly
    configuration = assembly.fdr_functional_configuration
    get edit_hangar_assembly_path(assembly)
    assert_response :success
    assert_select "select[name='assembly[assembly_method]'], input[name='assembly[fdr_functional_configuration_id]'], input[name='assembly[name]']", count: 0

    patch hangar_assembly_path(assembly), params: { assembly: { assembly_method: "PCB" } }
    assert_response :unprocessable_entity
    assert_equal "PERF", assembly.reload.assembly_method
    patch hangar_fdr_functional_configuration_path(configuration), params: { fdr_functional_configuration: { version: 2 } }
    assert_response :unprocessable_entity
    assert_equal 0, configuration.reload.version
    delete hangar_fdr_functional_configuration_path(configuration)
    assert FdrFunctionalConfiguration.exists?(configuration.id)

    delete hangar_assembly_path(assembly)
    assert Assembly.exists?(assembly.id)
    patch hangar_assembly_path(assembly), params: { assembly: { serviceability_state: "retired" } }
    assert_redirected_to hangar_assembly_path(assembly)
    assert_equal "retired", assembly.reload.serviceability_state
    patch hangar_assembly_path(assembly), params: { assembly: { serviceability_state: "in_preparation" } }
    assert_response :unprocessable_entity
  end

  test "empty catalogue has an actionable state on assembly creation" do
    get new_hangar_assembly_path(assembly: { assembly_type: "ExoFDR" })
    assert_response :success
    assert_select ".workspace-empty", /No functional configurations available/
    assert_select "a[href='#{new_hangar_fdr_functional_configuration_path}']", text: "Create a functional configuration"
    assert_select "input[type='submit'][disabled]", count: 1
  end

  test "assembly preview only exposes open actions and retains explicit Asset ID labels" do
    assembly = create_exofdr_assembly
    controller = create_embedded_controller(assembly:, device_id: "ECU-A172E0")
    get hangar_assemblies_path(assembly_id: assembly.id)
    assert_response :success
    assert_select "section[aria-label='Selected assembly details'] .workspace-actions" do
      assert_select "a", count: 2
      assert_select "a[href='#{hangar_assembly_path(assembly)}']", text: "Open"
      assert_select "a[href='#{forge_fdr_path(controller)}']", text: "Open in Forge"
      assert_select "button", count: 0
    end
    assert_select "main", text: /Open controller in Forge/, count: 0
    assert_select ".hangar-details-body dt", text: "Internal Asset ID", count: 1

    get hangar_assembly_path(assembly)
    assert_select "a[href='#{edit_hangar_assembly_path(assembly)}']", text: "Edit"
    assert_select "a[href='#{forge_fdr_path(controller)}']", text: "Open in Forge"
    assert_select "button", text: "Retire", count: 0
    assert_select "button", text: "Delete", count: 0
    assert_select ".workspace-details dt", text: "Internal Asset ID", count: 1
    assert_select ".assembly-tree-node small", text: "Asset ID #{controller.part.internal_number}"
  end
end
