require "test_helper"

class HangarForgeTest < ActiveSupport::TestCase
  setup do
    @gps = Function.create!(code: "gps_test", name: "GPS")
    @imu = Function.create!(code: "imu_test", name: "IMU")
    @assembly = Assembly.create!(code: "FDR-TEST-001", name: "Test FDR")
    @gps_part = Part.create!(
      internal_number: "PART-TEST-000001",
      function: @gps,
      manufacturer: "Holybro",
      model: "M9N"
    )
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
    child = Assembly.create!(code: "FDR-TEST-CHILD", name: "Child", parent: @assembly)

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
    imu_part = Part.create!(internal_number: "PART-TEST-000002", function: @imu, model: "BNO085", assembly: @assembly)

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
