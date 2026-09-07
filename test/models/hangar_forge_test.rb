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

    assert_match(/\AEXO-\d{4}\z/, assembly.internal_number)
    assert_match(/\AEXO-\d{4}\z/, part.internal_number)
    assert_not_equal assembly.internal_number, part.internal_number
    assert_equal assembly.internal_number, assembly.asset_identifier.formatted
    assert_equal part.internal_number, part.asset_identifier.formatted

    assert_not assembly.update(internal_number: "EXO-9999")
    assert_includes assembly.errors[:internal_number], "cannot be changed"
    assert_not part.update(internal_number: "EXO-9998")
    assert_includes part.errors[:internal_number], "cannot be changed"
  end

  test "the internal Asset ID format is limited to four digits" do
    assert_equal "EXO-0042", AssetIdentifier.new(id: 42).formatted
    assert_raises(RangeError) { AssetIdentifier.new(id: 10_000).formatted }
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

  test "a controlled ExoFDR receives a generated unique immutable serial number" do
    first = create_exofdr_assembly
    second = create_exofdr_assembly
    first_serial_number = first.serial_number

    assert_match Assembly::EXOFDR_SERIAL_PATTERN, first_serial_number
    assert_equal first_serial_number.split("-").last.to_i + 1,
      second.serial_number.split("-").last.to_i
    assert_not first.update(serial_number: "EXOFDR-V0-PERF-9999")
    assert_includes first.errors[:serial_number], "cannot be changed"
    assert_equal first_serial_number, first.reload.serial_number

    manual = Assembly.new(assembly_type: "ExoFDR", fdr_functional_configuration: create_fdr_functional_configuration, assembly_method: "PERF", serial_number: "EXOFDR-V0-PERF-9999")
    assert_not manual.valid?
    assert_includes manual.errors[:serial_number], "is assigned automatically"
  end

  test "a generic assembly does not receive an ExoFDR serial number" do
    assembly = Assembly.create!(name: "Generic equipment")

    assert_nil assembly.serial_number
    assert_equal "Asset ID #{assembly.internal_number}", assembly.identity_label
    assert_equal "Generic equipment", assembly.display_name
  end

  test "legacy generic equipment does not consume ExoFDR serial sequences" do
    assert_no_difference -> { IdentifierSequence.count } do
      assert_nil Assembly.create!(name: "Legacy equipment").serial_number
    end
  end

  test "an ExoFDR serial remains stable when its controller is replaced" do
    @assembly = create_exofdr_assembly
    serial_number = @assembly.serial_number
    original = create_embedded_controller(assembly: @assembly, device_id: "ECU-A172E0")
    replacement_part = Part.create!(function: original.part.function, manufacturer: "Seeed Studio", model: "XIAO ESP32S3")
    replacement = EmbeddedController.create!(part: replacement_part, device_id: "ECU-F00D01")

    original.part.remove_from_assembly!
    replacement_part.install_in!(@assembly)

    assert_equal serial_number, @assembly.reload.serial_number
    assert_equal replacement, @assembly.embedded_controller
    assert_nil original.reload.assembly
  end

  test "only Controller parts can be assigned to embedded controllers" do
    controller = EmbeddedController.new(part: @gps_part, device_id: "ECU-A172E0")

    assert_not controller.valid?
    assert_includes controller.errors[:part], "must have the Controller function"
  end

  test "a part assigned to an embedded controller must keep the Controller function" do
    controller_function = Function.find_or_create_by!(code: "CONTROLLER") do |function|
      function.name = "Controller"
    end
    controller_part = Part.create!(function: controller_function, model: "XIAO ESP32S3")
    EmbeddedController.create!(part: controller_part, device_id: "ECU-A172E0")

    assert_not controller_part.update(function: @gps)
    assert_includes controller_part.errors[:function], "must be Controller while an embedded controller is assigned"
    assert_equal controller_function, controller_part.reload.function

    assert @gps_part.update(function: @imu)
  end

  test "ECU IDs are normalized, validated, and unique" do
    recorder = create_embedded_controller(assembly: Assembly.create!(name: "Physical recorder"), device_id: " ecu-a172e0 ")

    assert_equal "ECU-A172E0", recorder.device_id
    assert_not EmbeddedController.new(device_id: "ECU-A172E0").valid?
    assert_not EmbeddedController.new(device_id: "ECU-not-a-chip").valid?

    legacy = EmbeddedController.new(device_id: "EXOFDR-F00D01")
    assert_not legacy.valid?
  end

  test "controller activity is append-only and human-readable" do
    fdr = create_embedded_controller(assembly: @assembly, device_id: "ECU-A172E0")
    activity = fdr.record_activity!(
      "controller_part_linked",
      source: "forge",
      actor: users(:operator),
      details: { asset_id: fdr.part.internal_number }
    )

    assert_equal "Controller part assignment changed", activity.title
    assert_equal "Linked to controller part #{fdr.part.internal_number}.", activity.description
    assert_not activity.update(event_type: "registered")
    assert_not activity.destroy
    assert DeviceActivity.exists?(activity.id)
  end

  test "Wi-Fi upload file identity is scoped to one embedded controller" do
    first = create_embedded_controller(assembly: @assembly, device_id: "ECU-A172E0")
    second = EmbeddedController.create!(device_id: "ECU-ABC123")
    attributes = {
      filename: "FDR000001.BIN",
      file_index: 1,
      boot_id: 42,
      format_version: 3,
      size_bytes: 1_024,
      sha256: "a" * 64
    }

    assert first.fdr_wifi_uploads.create!(attributes).persisted?
    assert second.fdr_wifi_uploads.create!(attributes).persisted?
  end

  test "Signal presence presents recorder status in operator language" do
    fdr = create_embedded_controller(assembly: @assembly, device_id: "ECU-A172E0")
    presence = fdr.create_signal_presence!(
      last_seen_at: Time.current,
      status: {
        "alert_flags" => 0x08,
        "last_sync_result" => 1,
        "last_synced_file_index" => 42,
        "diagnostics" => { "storage_write_errors" => 1 }
      }
    )

    assert_equal "Storage attention", presence.health_label
    assert_equal "Last file FDR000042.BIN", presence.synchronization_label

    presence.status = { "alert_flags" => 0, "last_sync_result" => 0, "diagnostics" => {} }
    assert_equal "Nominal", presence.health_label
    assert_equal "No synchronization yet", presence.synchronization_label
  end

  test "part installation keeps one current assembly and state" do
    installed_at = 3.hours.ago
    removed_at = 2.hours.ago
    replacement_assembly = Assembly.create!(name: "Replacement assembly")
    @gps_part.install_in!(@assembly, at: installed_at)

    assert_equal @assembly, @gps_part.assembly
    assert_equal "installed", @gps_part.state

    @gps_part.remove_from_assembly!(at: removed_at)

    assert_nil @gps_part.assembly
    assert_equal "available", @gps_part.state

    @gps_part.install_in!(replacement_assembly, at: 1.hour.ago)

    assert_equal replacement_assembly, @gps_part.assembly
    assert_equal @assembly, @gps_part.assembly_at(installed_at + 30.minutes)
    assert_equal replacement_assembly, @gps_part.assembly_at(30.minutes.ago)
    assert_equal 2, @gps_part.part_installations.count
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
    imu_part = create_installed_part(assembly: @assembly, function: @imu, model: "BNO085")

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
