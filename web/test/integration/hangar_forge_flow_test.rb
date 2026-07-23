require "test_helper"

class HangarForgeFlowTest < ActionDispatch::IntegrationTest
  setup do
    @function = Function.create!(code: "GPS_FLOW", name: "GPS")
    @assembly = Assembly.create!(code: "FDR-FLOW-001", name: "Flow FDR")
    @part = Part.create!(
      internal_number: "PART-FLOW-000001",
      function: @function,
      manufacturer: "Holybro",
      model: "M9N",
      assembly: @assembly
    )
    @build = Build.create!(code: "FDR-DEV-801", assembly: @assembly, created_by: users(:operator))
  end

  test "operator can navigate Hangar and Forge" do
    sign_in_as users(:operator)

    get hangar_path
    assert_response :success
    assert_select "h1", "Parts"
    assert_select "a", text: @part.internal_number

    get hangar_assembly_path(@assembly)
    assert_response :success
    assert_select "h1", @assembly.code
    assert_select ".assembly-function", "GPS"

    get forge_build_path(@build)
    assert_response :success
    assert_select "h1", @build.code
    assert_select ".build-snapshot-node", minimum: 1

    get new_forge_build_path(build: { assembly_id: @assembly.id })
    assert_response :success
    assert_select "select[name='build[assembly_id]'] option[selected]", @assembly.code
  end

  test "bench token accepts an idempotent test result and freezes the build" do
    token = users(:operator).rotate_bench_token!
    payload = result_payload
    headers = { "Authorization" => "Bearer #{token}" }

    post api_v1_bench_test_runs_path, params: payload.to_a.reverse.to_h, as: :json, headers: headers

    assert_response :created
    run = TestRun.find_by!(uuid: payload[:uuid])
    assert_equal users(:operator), run.operator
    assert_equal "passed", run.outcome
    assert @build.reload.locked?
    assert_equal "bench-revision", @build.source_revision
    assert_equal "e" * 64, @build.firmware_sha256

    post api_v1_bench_test_runs_path, params: { result: payload.to_json }, headers: headers

    assert_response :success
    assert_equal 1, TestRun.where(uuid: payload[:uuid]).count

    changed_build = result_payload.merge(
      uuid: SecureRandom.uuid,
      build_configuration: result_payload[:build_configuration].merge(source_revision: "other-revision")
    )
    post api_v1_bench_test_runs_path, params: changed_build, as: :json, headers: headers

    assert_response :bad_request
    assert_equal 1, @build.test_runs.count
  end

  test "bench endpoint rejects invalid or changed credentials and payloads" do
    post api_v1_bench_test_runs_path, params: result_payload, as: :json
    assert_response :unauthorized

    token = users(:operator).rotate_bench_token!
    headers = { "Authorization" => "Bearer #{token}" }
    payload = result_payload
    post api_v1_bench_test_runs_path, params: payload, as: :json, headers: headers
    assert_response :created

    changed = payload.merge(outcome: "failed")
    post api_v1_bench_test_runs_path, params: changed, as: :json, headers: headers
    assert_response :conflict
  end

  test "admin can validate a passed synchronized test" do
    run = TestRun.create!(
      uuid: SecureRandom.uuid,
      build: @build,
      operator: users(:operator),
      recipe_id: "FDR_GPS_IMU_SMOKE_V1",
      recipe_version: "1",
      recipe_sha256: "a" * 64,
      ingestion_sha256: "b" * 64,
      outcome: "passed",
      ran_at: Time.current
    )
    sign_in_as users(:julien)

    patch validate_forge_test_run_path(run), params: { validation_note: "Reviewed" }

    assert_redirected_to forge_test_run_path(run)
    assert_equal users(:julien), run.reload.validated_by
  end

  test "operator can replace a part and clone the next build" do
    replacement = Part.create!(
      internal_number: "PART-FLOW-000002",
      function: @function,
      manufacturer: "Holybro",
      model: "M9N",
      serial_number: "FLOW-REPLACEMENT"
    )
    sign_in_as users(:operator)

    patch replace_part_hangar_assembly_path(@assembly, part_id: @part),
      params: { replacement_part_id: replacement.id }

    assert_redirected_to hangar_assembly_path(@assembly)
    assert_equal "available", @part.reload.state
    assert_equal @assembly, replacement.reload.assembly

    post clone_forge_build_path(@build)

    copy = Build.order(:created_at).last
    assert_redirected_to edit_forge_build_path(copy)
    assert_equal @build, copy.previous_build
    assert copy.contains_part?(replacement)
  end

  private

  def result_payload
    {
      uuid: "8b445ef2-f1af-4b20-861c-947fc6828b78",
      build_code: @build.code,
      recipe: { id: "FDR_GPS_IMU_SMOKE_V1", version: 1, sha256: "c" * 64 },
      outcome: "passed",
      ran_at: "2026-07-23T20:00:00Z",
      measurements: { gps_hz: 20.0, accel_hz: 31.5, gyro_hz: 24.2 },
      artifacts: [ { path: "observe_rates.log", size: 120, sha256: "d" * 64 } ],
      build_configuration: {
        source_revision: "bench-revision",
        source_dirty: false,
        source_diff_sha256: nil,
        arduino_core_version: "3.3.10",
        firmware_sha256: "e" * 64
      }
    }
  end
end
