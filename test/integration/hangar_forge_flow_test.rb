require "test_helper"

class HangarForgeFlowTest < ActionDispatch::IntegrationTest
  setup do
    @function = Function.create!(code: "GPS_FLOW", name: "GPS")
    @assembly = Assembly.create!(
      name: "Flow FDR",
      assembly_type: "ExoFDR", assembly_method: "PERF", fdr_functional_configuration: create_fdr_functional_configuration
    )
    @fdr = create_embedded_controller(assembly: @assembly, device_id: "ECU-F10A01")
    @part = create_installed_part(
      assembly: @assembly,
      function: @function,
      manufacturer: "Holybro",
      model: "M9N"
    )
  end

  test "operator can navigate Hangar and Forge" do
    sign_in_as users(:operator)

    get hangar_path
    assert_response :success
    assert_select "h1", "Hangar"
    assert_select "h2", "Fleet"
    assert_select ".hangar-tabs"
    assert_select ".hangar-summary-card", 3
    assert_select ".hangar-fleet-layout"
    assert_select "aside[aria-label='Fleet aircraft'] .hangar-fleet-item", minimum: 1
    assert_select "section[aria-label='Selected aircraft configuration']"
    assert_select ".hangar-asset-title .status-dot.is-ready", text: "Ready", count: 1
    assert_select ".hangar-asset-head > .workspace-status", count: 0
    assert_select "main", text: /Operational vehicle/, count: 0
    assert_select ".hangar-config-head", text: /Installed configuration/
    assert_select ".hangar-config-head > span", count: 1
    assert_select ".hangar-detail-foot", count: 0
    assert_select ".sillage-room-link.is-separated", text: /Signal/
    assert_select ".sillage-room-link[href='#{forge_path}']", text: /Forge/
    assert_select ".sillage-core-link", count: 0

    get hangar_parts_path
    assert_response :success
    assert_select "h1", "Hangar"
    assert_select "h2", "Parts"
    assert_select "a", text: @part.display_name
    assert_select ".workspace-muted", text: /Asset ID #{@part.internal_number}/

    get hangar_parts_path(q: "Holybro", state: "installed")
    assert_response :success
    assert_select "a", text: @part.display_name

    get hangar_parts_path(q: "No matching serial")
    assert_response :success
    assert_select ".workspace-muted", text: /Asset ID #{@part.internal_number}/, count: 0

    get new_hangar_part_path
    assert_response :success
    assert_select "label", text: /Internal Asset ID/
    assert_select "input[name='part[internal_number]']", count: 0

    get new_hangar_assembly_path
    assert_response :success
    assert_select "label", text: /Internal Asset ID/
    assert_select "input[name='assembly[code]'], input[name='assembly[internal_number]']", count: 0
    assert_select "input[name='assembly[serial_number]']", count: 0
    assert_select "select[name='assembly[assembly_type]']", count: 1
    assert_select "table.workspace-choice-table", text: /Planned capabilities/
    assert_select "input[name='assembly[device_id]']", count: 0

    get hangar_assembly_path(@assembly)
    assert_redirected_to forge_fdr_path(@assembly.serial_number)
    follow_redirect!
    assert_select "h2", @assembly.serial_number
    assert_select ".workspace-details", text: /Wi-Fi hostname.*#{@assembly.serial_number.downcase}/m
    assert_select ".workspace-details dt", text: "ECU ID", count: 0
    assert_select ".fdr-recorder-tabs", text: /Overview.*Parts.*Files.*Connectivity.*Calibration.*Activity/
    assert_select ".workspace-panel", text: /FDR identity/
    assert_select ".workspace-details dt", text: "Hardware platform", count: 1
    get parts_forge_fdr_path(@assembly.serial_number)
    assert_response :success
    assert_select ".assembly-function", "GPS"
    assert_select "main", text: /#{@fdr.device_id}/, count: 0

    get new_hangar_aircraft_path
    assert_response :success
    assert_select "input[name='aircraft[telemetry_system_id]']", count: 0
    assert_select "label", text: /Selectable for flight preparation/

    get new_hangar_function_path
    assert_response :success
    assert_select "input[name='function[code]']", count: 0
    assert_select "input[name='function[name]']", count: 1
  end

  test "retired Forge and bench endpoints are not routable" do
    [ [ "/forge/builds", :get ], [ "/forge/test_runs", :get ],
      [ "/forge/bench_token", :post ], [ "/api/v1/bench/test-runs", :post ] ].each do |path, method|
      assert_raises(ActionController::RoutingError) do
        Rails.application.routes.recognize_path(path, method: method)
      end
    end
  end

  test "function page renders an explicit empty inventory state" do
    sign_in_as users(:operator)
    empty_function = Function.create!(name: "I2C Multiplexer")

    get hangar_function_path(empty_function)

    assert_response :success
    assert_select ".workspace-panel-header", text: /Assigned inventory.*0 parts/m
    assert_select ".workspace-empty", text: "No parts use this function yet.", count: 1
    assert_select ".workspace-list", count: 0
  end


  test "installed is displayed as a derived part state instead of an editable option" do
    sign_in_as users(:julien)

    get new_hangar_part_path

    assert_response :success
    assert_select "select[name='part[state]'] option[value='installed']", count: 0
    assert_select "select[name='part[state]'] option", text: "Available"
    assert_select "select[name='part[state]'] option", text: "Quarantined"
    assert_select "select[name='part[state]'] option", text: "Retired"

    get edit_hangar_part_path(@part)

    assert_response :success
    assert_select "select[name='part[state]']", count: 0
    assert_select "input[disabled][value='Installed']", count: 1
  end




  test "operator can replace a part" do
    replacement = Part.create!(
      function: @function,
      manufacturer: "Holybro",
      model: "M9N",
      serial_number: "FLOW-REPLACEMENT"
    )
    sign_in_as users(:operator)

    patch replace_part_hangar_assembly_path(@assembly, part_id: @part),
      params: { replacement_part_id: replacement.id }

    assert_redirected_to hangar_assembly_path(@assembly)
    assert_equal "available", @part.reload.state
    assert_equal @assembly, replacement.reload.assembly
  end
end
