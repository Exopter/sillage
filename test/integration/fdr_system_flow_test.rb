require "test_helper"

class FdrSystemFlowTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as_admin users(:operator)
    @configuration = create_fdr_functional_configuration(version: 2)
  end

  def create_typed(role)
    Assembly.create!(assembly_type: "ExoFDR", fdr_component_type: role, fdr_functional_configuration: @configuration)
  end

  test "Hangar creates a logical system and exposes missing modules without connection claims" do
    post hangar_assemblies_path, params: { assembly: { assembly_type: "ExoFDR", fdr_functional_configuration_id: @configuration.id, fdr_component_type: "SYSTEMS" } }
    system = Assembly.order(:id).last
    assert_redirected_to hangar_assembly_path(system)
    follow_redirect!
    assert_response :success
    assert_select "h2", "EXOFDR-V2-SYSTEMS-01"
    assert_select "span", "Logical system"
    assert_select "td", text: "Not assigned", count: 4
    assert_select "td", text: "No current connection reported", count: 4
    assert_select "a", text: "Open in Forge", count: 0
    get forge_fdr_path(system.serial_number)
    assert_redirected_to hangar_assembly_path(system)
  end

  test "module connection keeps its identity while system membership is shown and preserved" do
    system = create_typed("SYSTEMS")
    main = create_typed("MAIN")
    board = EmbeddedController.create!(device_id: "ECU-E072A1F81D84")
    FdrIdentity::BindBoard.new(assembly: main, controller: board).call
    post attach_assembly_hangar_assembly_path(system), params: { child_id: main.id }
    assert_redirected_to hangar_assembly_path(system)
    assert_equal system, main.reload.parent
    get forge_fdr_path(main.serial_number)
    assert_response :success
    assert_select ".exds-recorder-heading p", main.serial_number
    assert_select ".exds-recorder-heading a[href='#{hangar_assembly_path(system)}']", system.serial_number
    get api_v1_fdr_registration_path, params: { device_id: board.device_id }, as: :json
    identity = response.parsed_body.dig("recorder", "assembly")
    assert_equal main.serial_number, identity["serial_number"]
    assert_equal system.serial_number, identity.dig("system", "serial_number")
    get hangar_assembly_path(system)
    assert_select "td", text: "No current connection reported", count: 4
    assert_select "h2", "System membership history"
    delete detach_assembly_hangar_assembly_path(system, child_id: main.id)
    assert_redirected_to hangar_assembly_path(system)
    assert_nil main.reload.parent_id
    assert_not_nil main.module_memberships.sole.removed_at
  end

  test "Forge setup creates a typed standalone Lite and cannot bind a system" do
    board = EmbeddedController.create!(device_id: "ECU-E072A1F81D84")
    get forge_fdr_path(board)
    assert_response :success
    assert_select "select[name='fdr_component_type'] option[value='SYSTEMS']", count: 0
    patch forge_fdr_path(board), params: { configuration_id: @configuration.id, fdr_component_type: "LITE" }
    lite = board.reload.assembly
    assert_equal "EXOFDR-V2-LITE-01", lite.serial_number
    assert_nil lite.parent_id
    system = create_typed("SYSTEMS")
    other = EmbeddedController.create!(device_id: "ECU-E072A1FA3E78")
    assert_no_difference -> { FdrBoardInstallation.count } do
      patch forge_fdr_path(other), params: { assembly_id: system.id }
    end
    assert_nil other.reload.assembly
  end

  test "Signal resolves an aircraft through the installed system" do
    system = create_typed("SYSTEMS")
    main = create_typed("MAIN")
    main.update!(parent: system)
    board = EmbeddedController.create!(device_id: "ECU-E072A1F81D84", mavlink_system_id: 42, mavlink_component_id: 191)
    FdrIdentity::BindBoard.new(assembly: main, controller: board).call
    Installation.create!(installable: system, aircraft: aircraft(:pilatus), installed_at: Time.current)
    flight = users(:operator).flights.create!(name: "System telemetry", status: "live")
    session = users(:operator).signal_sessions.create!(flight:)
    assert_equal aircraft(:pilatus), Signal::IdentifySource.new(signal_session: session, system_id: 42, component_id: 191).call
    assert_equal aircraft(:pilatus), flight.reload.aircraft
    snapshot = flight.configuration_snapshot.fetch("installations").find { |item| item.dig("asset", "serial_number") == system.serial_number }
    assert_equal main.serial_number, snapshot.dig("asset", "assemblies", 0, "serial_number")
  end

  test "Signal learns only Main for a prepared system and does not overwrite another radio identity" do
    system = create_typed("SYSTEMS")
    main = create_typed("MAIN")
    central = create_typed("CENTRAL")
    main.update!(parent: system)
    central.update!(parent: system)
    board = EmbeddedController.create!(device_id: "ECU-E072A1F81D84")
    other = EmbeddedController.create!(device_id: "ECU-E072A1FA3E78")
    FdrIdentity::BindBoard.new(assembly: main, controller: board).call
    FdrIdentity::BindBoard.new(assembly: central, controller: other).call
    Installation.create!(installable: system, aircraft: aircraft(:exowing), installed_at: Time.current)
    flight = users(:operator).flights.create!(name: "Prepared system", status: "live", aircraft: aircraft(:exowing))
    session = users(:operator).signal_sessions.create!(flight:)
    Signal::IdentifySource.new(signal_session: session, system_id: 42).call
    assert_equal 42, board.reload.mavlink_system_id
    assert_nil other.reload.mavlink_system_id
    Signal::IdentifySource.new(signal_session: session, system_id: 43, component_id: 191).call
    assert_equal 42, board.reload.mavlink_system_id
    assert_nil board.mavlink_component_id
  end
end
