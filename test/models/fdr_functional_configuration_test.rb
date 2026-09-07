require "test_helper"

class FdrFunctionalConfigurationTest < ActiveSupport::TestCase
  test "versions and capabilities are user defined and validated" do
    configuration = create_fdr_functional_configuration(version: 42, planned_capabilities: "Recording and radio")
    assert_equal "V42", configuration.label
    assert_not FdrFunctionalConfiguration.new(version: 42, planned_capabilities: "Duplicate").valid?
    [ -1, 1.5, "abc", 2**31, nil ].each do |version|
      assert_not FdrFunctionalConfiguration.new(version:, planned_capabilities: "Recording").valid?
    end
    assert_not FdrFunctionalConfiguration.new(version: 10, planned_capabilities: " ").valid?
    configuration.update!(version: 43, planned_capabilities: "Sensor recording")
    assert_equal "V43", configuration.label
  end

  test "an assigned capability baseline is immutable and retained after retirement" do
    assembly = create_exofdr_assembly
    configuration = assembly.fdr_functional_configuration
    assert_not configuration.update(version: 1)
    assert_not configuration.reload.update(planned_capabilities: "Radio")
    assert_not configuration.reload.destroy
    assembly.update!(serviceability_state: "retired")
    assert_not configuration.reload.update(planned_capabilities: "Radio")
    assert_not configuration.reload.destroy
  end

  test "serial sequences are separate per version and assembly method" do
    configuration = create_fdr_functional_configuration(version: 42)
    first = create_exofdr_assembly(fdr_functional_configuration: configuration)
    second = create_exofdr_assembly(fdr_functional_configuration: configuration)
    pcb = create_exofdr_assembly(fdr_functional_configuration: configuration, assembly_method: "PCB")
    next_version = create_exofdr_assembly(fdr_functional_configuration: create_fdr_functional_configuration(version: 43))
    assert_equal "EXOFDR-V42-PERF-01", first.serial_number
    assert_equal "EXOFDR-V42-PERF-02", second.serial_number
    assert_equal "EXOFDR-V42-PCB-01", pcb.serial_number
    assert_equal "EXOFDR-V43-PERF-01", next_version.serial_number
    assert_equal first.serial_number, first.name
    assert_equal first.name, first.display_name
    assert_equal first.name, first.selection_label
  end

  test "invalid creations consume no serial and cannot omit ExoFDR parameters" do
    configuration = create_fdr_functional_configuration(version: 42)
    assert_no_difference -> { IdentifierSequence.count } do
      assert_not Assembly.new(assembly_type: "ExoFDR").save
      assert_not Assembly.new(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, assembly_method: "WIRE").save
      assert_not Assembly.new(assembly_type: "ExoFDR", fdr_functional_configuration: configuration, assembly_method: "PERF", serviceability_state: "invalid").save
    end
    assert_equal "EXOFDR-V42-PERF-01", create_exofdr_assembly(fdr_functional_configuration: configuration).serial_number
  end

  test "assembly identity and parameters cannot be changed and retirement is terminal" do
    assembly = create_exofdr_assembly
    original = assembly.snapshot
    { assembly_type: nil, assembly_method: "PCB", fdr_functional_configuration: create_fdr_functional_configuration(version: 1), name: "Renamed" }.each do |attribute, value|
      assert_not assembly.reload.update(attribute => value)
    end
    assert_not assembly.reload.destroy
    assembly.reload.update!(serviceability_state: "retired")
    assert_not assembly.update(serviceability_state: "in_preparation")
    assert_equal original.fetch("serial_number"), assembly.reload.serial_number
    assert_equal original.fetch("functional_configuration"), assembly.snapshot.fetch("functional_configuration")
  end

  test "retiring an assembly permits part reuse without changing the old composition history" do
    assembly = create_exofdr_assembly
    controller = create_embedded_controller(assembly:, device_id: "ECU-A172E0")
    installed_at = controller.part.active_part_installation.installed_at
    assembly.update!(serviceability_state: "retired")
    controller.part.remove_from_assembly!
    replacement = create_exofdr_assembly(assembly_method: "PCB")
    controller.part.install_in!(replacement)
    assert_equal assembly, controller.part.assembly_at(installed_at)
    assert_equal replacement, controller.reload.assembly
    assert_not_equal assembly.serial_number, replacement.serial_number
    spare = Part.create!(function: controller.part.function, model: "Spare ECU")
    assert_raises(ActiveRecord::RecordInvalid) { spare.install_in!(assembly) }
    assert_not Installation.new(installable: assembly, aircraft: aircraft(:pilatus), installed_at: Time.current).valid?
  end

  test "retirement requires removal from the aircraft" do
    assembly = create_exofdr_assembly
    installation = Installation.create!(installable: assembly, aircraft: aircraft(:pilatus), installed_at: 1.hour.ago)
    assert_not assembly.update(serviceability_state: "retired")
    installation.remove!
    assert assembly.reload.update(serviceability_state: "retired")
  end
end
