require "test_helper"

class HangarForgeTest < ActiveSupport::TestCase
  setup do
    @gps = Function.create!(code: "gps_test", name: "GPS")
    @imu = Function.create!(code: "imu_test", name: "IMU")
    @assembly = Assembly.create!(name: "Test FDR")
    @gps_part = Part.create!(
      function: @gps,
      manufacturer: "Holybro",
      model: "M9N"
    )
  end

  test "parts and assemblies receive immutable Exopter Asset IDs" do
    assembly = Assembly.create!(name: "Identified assembly")
    part = Part.create!(function: @gps, model: "Identified part")

    assert_match(/\AEXO-\d{6,}\z/, assembly.internal_number)
    assert_match(/\AEXO-\d{6,}\z/, part.internal_number)
    assert_not_equal assembly.internal_number, part.internal_number
    assert_equal assembly.internal_number, assembly.asset_identifier.formatted
    assert_equal part.internal_number, part.asset_identifier.formatted

    assert_not assembly.update(internal_number: "EXO-999999")
    assert_includes assembly.errors[:internal_number], "cannot be changed"
    assert_not part.update(internal_number: "EXO-999998")
    assert_includes part.errors[:internal_number], "cannot be changed"
  end

  test "asset IDs remain stable when business attributes change" do
    assembly_number = @assembly.internal_number
    part_number = @gps_part.internal_number

    @assembly.update!(name: "Renamed FDR")
    @gps_part.update!(function: @imu, model: "Replacement role")

    assert_equal assembly_number, @assembly.reload.internal_number
    assert_equal part_number, @gps_part.reload.internal_number
  end

  test "asset IDs are never reused after an asset is deleted" do
    deleted_number = @gps_part.internal_number
    identifier = @gps_part.asset_identifier

    @gps_part.destroy!
    replacement = Part.create!(function: @gps, model: "Replacement part")

    assert AssetIdentifier.exists?(identifier.id)
    assert_not_equal deleted_number, replacement.internal_number
    assert_operator replacement.asset_identifier.id, :>, identifier.id
  end

  test "physical recorder IDs are normalized, validated, and unique" do
    recorder = Assembly.create!(name: "Physical recorder", device_id: " exofdr-a172e0 ")

    assert_equal "EXOFDR-A172E0", recorder.device_id
    assert_not Assembly.new(name: "Duplicate recorder", device_id: "EXOFDR-A172E0").valid?
    assert_not Assembly.new(name: "Invalid recorder", device_id: "EXOFDR-not-a-chip").valid?
  end

  test "part installation keeps one current assembly and state" do
    @gps_part.install_in!(@assembly)

    assert_equal @assembly, @gps_part.assembly
    assert_equal "installed", @gps_part.state

    @gps_part.remove_from_assembly!

    assert_nil @gps_part.assembly
    assert_equal "available", @gps_part.state
  end

  test "quarantined part cannot be installed" do
    @gps_part.update!(state: "quarantined")

    assert_raises(ActiveRecord::RecordInvalid) { @gps_part.install_in!(@assembly) }
    assert_nil @gps_part.reload.assembly
  end

  test "assembly cannot be attached below its descendant" do
    child = Assembly.create!(name: "Child", parent: @assembly)

    assert_not @assembly.update(parent: child)
    assert_includes @assembly.errors[:parent], "cannot be one of its descendants"
  end

  test "build snapshot freezes after the first test" do
    @gps_part.install_in!(@assembly)
    build = Build.create!(code: "FDR-DEV-901", assembly: @assembly, created_by: users(:operator))
    run = create_test_run(build: build)

    assert run.persisted?
    assert build.reload.locked?
    assert_not build.update(notes: "Changed after test")
    assert_includes build.errors[:base], "Tested builds are immutable. Clone this build to create the next iteration."
  end

  test "cloning captures the current assembly and previous build" do
    @gps_part.install_in!(@assembly)
    original = Build.create!(code: "FDR-DEV-902", assembly: @assembly, created_by: users(:operator))
    imu_part = Part.create!(function: @imu, model: "BNO085", assembly: @assembly)

    copy = original.clone_as_next!(by: users(:operator))
    copy.update!(source_revision: "next-revision")

    assert_equal original, copy.previous_build
    assert copy.contains_part?(imu_part)
    assert_equal [ imu_part.internal_number ], copy.part_changes[:added]
    assert_equal [ "Git revision" ], copy.configuration_changes.pluck(:label)
  end

  test "only passed tests can be validated by an admin" do
    build = Build.create!(code: "FDR-DEV-903", assembly: @assembly, created_by: users(:operator))
    failed = create_test_run(build: build, outcome: "failed", uuid: SecureRandom.uuid)

    assert_raises(ActiveRecord::RecordInvalid) do
      failed.validate_by!(users(:julien), note: "Not acceptable")
    end

    passed = create_test_run(build: build, outcome: "passed", uuid: SecureRandom.uuid)
    passed.validate_by!(users(:julien), note: "Bench evidence reviewed")

    assert passed.validated?
    assert_equal users(:julien), passed.validated_by
  end

  private

  def create_test_run(build:, outcome: "passed", uuid: SecureRandom.uuid)
    TestRun.create!(
      uuid: uuid,
      build: build,
      operator: users(:operator),
      recipe_id: "FDR_GPS_IMU_SMOKE_V1",
      recipe_version: "1",
      recipe_sha256: "a" * 64,
      ingestion_sha256: "b" * 64,
      outcome: outcome,
      ran_at: Time.current
    )
  end
end
