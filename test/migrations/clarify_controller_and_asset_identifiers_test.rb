require "test_helper"
require Rails.root.join("db/migrate/20260904160000_clarify_controller_and_asset_identifiers").to_s

class ClarifyControllerAndAssetIdentifiersTest < ActiveSupport::TestCase
  test "rewrites nested internal Asset IDs and ECU IDs" do
    migration = ClarifyControllerAndAssetIdentifiers.new
    value = {
      "internal_number" => "EXO-000042",
      "name" => "Integrated FDR · EXOFDR-A172E0",
      "controller" => { "device_id" => "EXOFDR-A172E0" }
    }

    rewritten = migration.send(
      :rewrite_value,
      value,
      { "EXO-000042" => "EXO-0042" },
      "ECU"
    )

    assert_equal "EXO-0042", rewritten["internal_number"]
    assert_equal "Integrated FDR · ECU-A172E0", rewritten["name"]
    assert_equal "ECU-A172E0", rewritten.dig("controller", "device_id")
  end
end
