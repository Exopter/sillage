require "test_helper"
require Rails.root.join("db/migrate/20260817120000_unify_asset_identifiers").to_s

class UnifyAssetIdentifiersTest < ActiveSupport::TestCase
  test "rewrites nested snapshot asset IDs without changing free text" do
    snapshot = {
      "internal_number" => "ASY-000004",
      "notes" => "Replaces PART-000005 after qualification",
      "parts" => [
        { "internal_number" => "PART-000005", "model" => "ASPD-AUAV" }
      ],
      "assemblies" => [
        { "internal_number" => "ASY-000006", "parts" => [] }
      ]
    }
    mapping = {
      "ASY-000004" => "EXO-000002",
      "PART-000005" => "EXO-000004",
      "ASY-000006" => "EXO-000005"
    }

    rewritten = UnifyAssetIdentifiers.new.send(:rewrite_value, snapshot, mapping)

    assert_equal "EXO-000002", rewritten["internal_number"]
    assert_equal "EXO-000004", rewritten.dig("parts", 0, "internal_number")
    assert_equal "EXO-000005", rewritten.dig("assemblies", 0, "internal_number")
    assert_equal "Replaces PART-000005 after qualification", rewritten["notes"]
  end

  test "finds and identifies historical-only assets in nested snapshots" do
    snapshot = {
      "internal_number" => "ASY-000004",
      "parts" => [ { "internal_number" => "PART-000005" } ],
      "notes" => "PART-999999 is free text, not an asset reference"
    }
    migration = UnifyAssetIdentifiers.new

    assert_equal %w[ASY-000004 PART-000005],
      migration.send(:collect_internal_numbers, snapshot)
    assert_equal [ "Assembly", 4 ], migration.send(:legacy_identity, "ASY-000004")
    assert_equal [ "Part", 5 ], migration.send(:legacy_identity, "PART-000005")
    assert_raises(ActiveRecord::MigrationError) do
      migration.send(:legacy_identity, "LEGACY-CUSTOM-ID")
    end
  end

  test "preserves numeric suffixes and gives Part priority on collisions" do
    assets = [
      asset(type: "Assembly", id: 4, internal_number: "ASY-000004"),
      asset(type: "Part", id: 1, internal_number: "PART-000001"),
      asset(type: "Part", id: 4, internal_number: "PART-000004"),
      asset(type: "Part", id: 5, internal_number: "PART-000005")
    ]

    plan = UnifyAssetIdentifiers.new.send(:allocation_plan, assets)
    numbers = plan.index_by { |item| [ item.fetch(:type), item.fetch(:id) ] }

    assert_equal 1, numbers.fetch([ "Part", 1 ]).fetch(:asset_number)
    assert_equal 4, numbers.fetch([ "Part", 4 ]).fetch(:asset_number)
    assert_equal 5, numbers.fetch([ "Part", 5 ]).fetch(:asset_number)
    assert_equal 2, numbers.fetch([ "Assembly", 4 ]).fetch(:asset_number)
  end

  private

  def asset(type:, id:, internal_number:)
    {
      type:,
      id:,
      internal_number:,
      created_at: Time.current,
      updated_at: Time.current,
      record: nil
    }
  end
end
