require "test_helper"

class ConfigurationSnapshotTest < ActiveSupport::TestCase
  test "captures top-level and assembly membership at flight time and freezes the result" do
    january = Time.utc(2026, 1, 1)
    february = Time.utc(2026, 2, 1)
    assembly = Assembly.create!(name: "Original assembly")
    replacement = Assembly.create!(name: "Replacement assembly")
    child = Assembly.create!(name: "Current subassembly", parent: assembly)
    Installation.create!(aircraft: aircraft(:pilatus), installable: assembly, installed_at: january, removed_at: february)
    Installation.create!(aircraft: aircraft(:pilatus), installable: replacement, installed_at: february)
    function = Function.create!(code: "SNAPSHOT", name: "Snapshot test")
    original_part = Part.create!(function:, model: "Original sensor")
    current_part = Part.create!(function:, model: "Replacement sensor")
    PartInstallation.create!(assembly:, part: original_part, installed_at: january, removed_at: february)
    PartInstallation.create!(assembly:, part: current_part, installed_at: february)
    flight = users(:julien).flights.create!(name: "January flight", aircraft: aircraft(:pilatus), started_at: january + 1.day)
    flight.capture_configuration!
    snapshot = flight.configuration_snapshot.deep_dup
    asset = snapshot.fetch("installations").sole.fetch("asset")
    assert_equal assembly.name, asset.fetch("name")
    assert_equal [ "Original sensor" ], asset.fetch("parts").map { |part| part.fetch("model") }
    assert_empty asset.fetch("assemblies")
    assert asset.fetch("history_limitations").any? { |message| message.include?("Subassembly") }
    assert child.persisted?

    assembly.update!(name: "Later name")
    flight.capture_configuration!
    assert_equal snapshot, flight.reload.configuration_snapshot
  end
end
