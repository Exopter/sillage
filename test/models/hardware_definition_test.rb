require "test_helper"

class HardwareDefinitionTest < ActiveSupport::TestCase
  test "derives canonical identifiers for perfboard and PCB implementations" do
    perfboard = create_hardware_definition
    pcb = create_hardware_definition(
      implementation_kind: "pcb",
      implementation_revision: "a",
      variant: "gh"
    )

    assert_equal "FDR-V0-PERF-01", perfboard.canonical_identifier
    assert_equal "FDR-V0-PCB-REV-A-GH", pcb.canonical_identifier
  end

  test "requires a variant only for PCB implementations" do
    pcb = HardwareDefinition.new(
      product_name: "ExoFDR",
      family_code: "FDR",
      functional_version: 0,
      implementation_kind: "pcb",
      implementation_revision: "A",
      qualification_state: "prototype"
    )

    assert_not pcb.valid?
    assert_includes pcb.errors[:variant], "must be present for a PCB variant"
  end

  test "freezes controlled identity after an assembly uses the definition" do
    definition = create_hardware_definition
    Assembly.create!(name: "Controlled FDR", hardware_definition: definition)

    assert_not definition.update(implementation_revision: "02")
    assert_includes definition.errors[:base], "A hardware definition used by an assembly cannot be renamed"
    assert_equal "FDR-V0-PERF-01", definition.reload.canonical_identifier
  end
end
