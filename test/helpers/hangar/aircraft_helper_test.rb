require "test_helper"

class Hangar::AircraftHelperTest < ActionView::TestCase
  test "maps known aircraft and asset statuses to semantic tones" do
    assert_equal [ "ready", "Ready" ], hangar_aircraft_status(Aircraft.new(active: true))
    assert_equal [ "fault", "Unavailable" ], hangar_aircraft_status(Aircraft.new(active: false))

    assembly = Assembly.new(serviceability_state: "in_preparation")
    assert_equal [ "pending", "In preparation" ], hangar_asset_status(assembly)

    assembly.serviceability_state = "serviceable"
    assert_equal [ "ready", "Serviceable" ], hangar_asset_status(assembly)

    assembly.serviceability_state = "quarantined"
    assert_equal [ "caution", "Quarantined" ], hangar_asset_status(assembly)

    assembly.serviceability_state = "retired"
    assert_equal [ "fault", "Retired" ], hangar_asset_status(assembly)

    assert_equal [ "ready", "Installed" ], hangar_asset_status(Part.new(state: "installed"))
    assert_equal [ "ready", "Available" ], hangar_asset_status(Part.new(state: "available"))
    assert_equal [ "caution", "Review flag" ], hangar_asset_status(Part.new(state: "quarantined"))
    assert_equal [ "fault", "Retired" ], hangar_asset_status(Part.new(state: "retired"))
  end
end
