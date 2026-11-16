require "test_helper"

class Forge::ModuleSetupTest < ActiveSupport::TestCase
  test "a bare board starts at the first step" do
    setup = Forge::ModuleSetup.new
    assert_equal %w[next pending pending pending pending pending], setup.steps.map(&:state)
    assert_equal "Next: connect the board over USB-C", setup.summary
    assert_not setup.complete?
  end

  test "a named module in a system waits only for its key and its name on the board" do
    configuration = create_fdr_functional_configuration(version: 2)
    system = Assembly.create!(assembly_type: "ExoFDR", fdr_component_type: "SYSTEMS", fdr_functional_configuration: configuration)
    seat = Assembly.create!(assembly_type: "ExoFDR", fdr_component_type: "SEAT", fdr_functional_configuration: configuration, parent: system)
    board = EmbeddedController.create!(device_id: "ECU-441BF685BEC8", last_identified_at: Time.current, last_seen_firmware: "v1_distributed/2")
    setup = Forge::ModuleSetup.new(assembly: seat, controller: board)

    assert_equal({ seen: "done", registered: "done", key: "next", named: "done", name_on_board: "pending", system: "done" },
      setup.steps.to_h { |step| [ step.key, step.state ] })
    assert_equal "Next: install the Sillage key over USB-C", setup.summary
    assert_match system.serial_number, setup.steps.last.detail
    # The board identifier never reaches the page.
    assert setup.steps.none? { |step| step.detail.include?(board.device_id) }
  end

  test "firmware without USB-C control makes the key and the name on the board unavailable, not pending" do
    configuration = create_fdr_functional_configuration(version: 2)
    system = Assembly.create!(assembly_type: "ExoFDR", fdr_component_type: "SYSTEMS", fdr_functional_configuration: configuration)
    central = Assembly.create!(assembly_type: "ExoFDR", fdr_component_type: "CENTRAL", fdr_functional_configuration: configuration, parent: system)
    board = EmbeddedController.create!(device_id: "ECU-DCB4D93A2350", last_identified_at: Time.current, last_seen_firmware: "v1_distributed/1")
    setup = Forge::ModuleSetup.new(assembly: central, controller: board)

    assert_equal %w[done done unavailable done unavailable done], setup.steps.map(&:state)
    assert setup.complete?
    assert setup.limited_by_firmware?
    assert_match(/Limited by firmware/, setup.summary)
  end
end
