require "test_helper"

class FdrSystemTest < ActiveSupport::TestCase
  def typed(role, version: 2, **attributes)
    Assembly.create!(assembly_type: "ExoFDR", fdr_component_type: role,
      fdr_functional_configuration: create_fdr_functional_configuration(version:), **attributes)
  end

  test "typed names have independent permanent sequences and systems are logical" do
    system = typed("SYSTEMS")
    main = typed("MAIN")
    assert_equal "EXOFDR-V2-SYSTEMS-01", system.serial_number
    assert_nil system.assembly_method
    assert_equal "EXOFDR-V2-MAIN-01", main.serial_number
    assert_equal "PCB", main.assembly_method
    assert_equal "EXOFDR-V2-MAIN-02", typed("MAIN").serial_number
    assert_equal "EXOFDR-V3-MAIN-01", typed("MAIN", version: 3).serial_number
    assert_equal "EXOFDR-V2-LITE-01", typed("LITE").serial_number
    assert_not main.update(fdr_component_type: "CENTRAL")
    assert_not main.reload.update(serial_number: "EXOFDR-V2-MAIN-99")
  end

  test "invalid type method and version do not issue a serial" do
    [ [ "SYSTEM", 2, nil ], [ "MAIN", 1, "PCB" ], [ "LITE", 2, "PERF" ], [ nil, 2, "PCB" ], [ "SYSTEMS", 2, "PCB" ] ].each do |role, version, method|
      configuration = create_fdr_functional_configuration(version:)
      assert_no_difference -> { IdentifierSequence.count } do
        assembly = Assembly.new(assembly_type: "ExoFDR", fdr_component_type: role,
          fdr_functional_configuration: configuration, assembly_method: method)
        assert_not assembly.save
      end
    end
  end

  test "module moves preserve identity and historical membership and aircraft" do
    first = typed("SYSTEMS")
    second = typed("SYSTEMS")
    main = typed("MAIN")
    board = EmbeddedController.create!(device_id: "ECU-A172E0")
    origin = Time.current.change(usec: 0)
    travel_to(origin) do
      FdrIdentity::BindBoard.new(assembly: main, controller: board).call
      main.update!(parent: first)
      Installation.create!(installable: first, aircraft: aircraft(:pilatus), installed_at: Time.current)
    end
    travel_to(origin + 1.hour) { main.update!(parent: second) }
    assert_equal "EXOFDR-V2-MAIN-01", main.serial_number
    assert_equal first, main.fdr_system_at(origin + 30.minutes)
    assert_equal second, main.fdr_system_at(origin + 1.hour)
    assert_equal aircraft(:pilatus), board.installation_at(origin + 30.minutes).aircraft
    assert_nil board.installation_at(origin + 1.hour)
    assert_equal first.serial_number, board.recorder_identity(at: origin + 30.minutes).dig(:assembly, :system, :serial_number)
    assert_equal second.serial_number, board.recorder_identity.dig(:assembly, :system, :serial_number)
    assert_equal [ main.serial_number ], first.snapshot(at: origin + 30.minutes).fetch("assemblies").map { |item| item.fetch("serial_number") }
    assert_empty first.snapshot(at: origin + 1.hour).fetch("assemblies")
    assert_equal board.device_id, first.snapshot(at: origin + 30.minutes).dig("assemblies", 0, "board_device_id")
    travel_to(origin + 2.hours) { main.update!(parent: nil) }
    assert_nil main.fdr_system_at
    assert_equal second, main.fdr_system_at(origin + 90.minutes)
    assert_equal 2, main.module_memberships.count
    assert_not main.module_memberships.recent.first.update(removed_at: nil)
  end

  test "database rejects missing physical construction metadata" do
    main = typed("MAIN")
    assert_raises(ActiveRecord::StatementInvalid) do
      Assembly.transaction(requires_new: true) { main.update_columns(assembly_method: nil) }
    end
    assert_equal "PCB", main.reload.assembly_method
  end

  test "systems reject duplicate roles nested systems lite and direct parts or boards" do
    system = typed("SYSTEMS")
    main = typed("MAIN", parent: system)
    assert_not typed("MAIN").update(parent: system)
    assert_not typed("LITE").update(parent: system)
    assert_not typed("SYSTEMS").update(parent: system)
    assert_not typed("CENTRAL").update(parent: main)
    assert_not typed("DISPLAY").update(parent: create_exofdr_assembly)
    assert_not system.update(serviceability_state: "retired")
    assert_not FdrBoardInstallation.new(assembly: system, embedded_controller: EmbeddedController.create!(device_id: "ECU-F00D01"), installed_at: Time.current).valid?
    function = Function.find_or_create_by!(code: "BATTERY") { |item| item.name = "Battery" }
    part = Part.create!(function:, model: "Pack")
    assert_raises(ActiveRecord::RecordInvalid) { part.install_in!(system) }
    assert_nil part.reload.assembly
  end

  test "bench modules and lite need no system and signed names identify the device" do
    %w[MAIN CENTRAL AIRSPEED DISPLAY LITE].each_with_index do |role, index|
      mod = typed(role)
      board = EmbeddedController.create!(device_id: format("ECU-%012X", index + 1))
      FdrIdentity::BindBoard.new(assembly: mod, controller: board).call
      board.ensure_fdr_auth_key!
      payload = FdrIdentity::NameProvisioning.payload(board)
      assert_equal mod.serial_number, [ payload.fetch(:command) ].pack("H*").unpack("CQ<a32").last.delete("\0")
      assert_nil board.recorder_identity.dig(:assembly, :system)
      assert_nil board.aircraft
    end
  end

  test "existing identities remain valid and are not renamed" do
    legacy = create_exofdr_assembly
    serial = legacy.serial_number
    legacy.update!(notes: "Existing unit")
    assert_equal serial, legacy.reload.serial_number
    assert_nil legacy.fdr_component_type
    assert_not legacy.update(fdr_component_type: "MAIN")
  end
end
