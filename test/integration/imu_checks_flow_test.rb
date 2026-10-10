require "test_helper"

class ImuChecksFlowTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:julien)
    @fdr = create_embedded_controller(device_id: "ECU-ABC123")
    @flight = users(:julien).flights.create!(name: "IMU test", status: "preparation")
    @samples = (0..150).map { |i| { t: i * 100, roll: -0.45, pitch: -0.17, accel: [ 0, 0, 9.80665 ], gyro: [ 0, 0, 0 ], mag: [ 20, 0, 25 ], accuracy: [ 3, 3, 3, 3 ], heading_accuracy: 3, quality_age: 100 } }
    @payload = { uuid: SecureRandom.uuid, expected_device_id: @fdr.device_id, device_id: @fdr.device_id, boot_id: 42, imu_epoch: 1,
                 firmware: "fdr_integrated/56", kind: "calibration", ground_reference_confirmed: true,
                 faces: %w[x+ x- y+ y- z+ z-].index_with { 3100 }, figure_eight_confirmed: true, samples: @samples }
  end

  test "a different connected recorder cannot save a check for the selected recorder" do
    other = create_embedded_controller(device_id: "ECU-DEF456")
    assert_no_difference "ImuCheck.count" do
      post api_v1_imu_checks_path, params: @payload.merge(device_id: other.device_id), as: :json
      assert_response :unprocessable_entity
      assert_match(/does not match the selected recorder/, response.parsed_body["error"])
      post api_v1_imu_checks_path, params: @payload.except(:expected_device_id), as: :json
      assert_response :bad_request
    end
  end

  test "Forge owns references and a preflight binds a flight to the exact boot" do
    get calibration_forge_fdr_path(@fdr)
    assert_response :success
    assert_select "[data-controller=imu-check]"
    post api_v1_imu_checks_path, params: @payload, as: :json
    assert_response :created
    assert_equal "passed", response.parsed_body["outcome"]
    reference = ImuCheck.last
    assert_nil reference.flight
    assert_difference "ImuCheck.count", 0 do
      post api_v1_imu_checks_path, params: @payload, as: :json
      assert_response :success
    end
    post api_v1_imu_checks_path, params: @payload.merge(uuid: SecureRandom.uuid, kind: "preflight", flight_id: @flight.id), as: :json
    assert_response :created
    check = ImuCheck.last
    assert_equal reference, check.calibration
    assert_equal @flight, check.flight
    assert_equal 42, check.boot_id
    get api_v1_imu_checks_path, params: { device_id: @fdr.device_id, firmware: @payload[:firmware], flight_id: @flight.id }
    assert_equal check.id, response.parsed_body.dig("preflight", "id")
  end

  test "low quality, data gaps and unknown values cannot pass" do
    @samples[50][:accuracy] = [ 3, 3, 0, 3 ]
    post api_v1_imu_checks_path, params: @payload, as: :json
    assert_response :created
    assert_equal "failed", response.parsed_body["outcome"]
    assert_nil ImuCheck.reference_for(@fdr, firmware: @payload[:firmware])
    @samples[50][:accuracy] = [ 3, 3, 3, 3 ]
    @samples[50][:t] = 9000
    assert_not Imu::Assessment.call(@samples.as_json)["passed"]
    @samples[50][:t] = 5000
    @samples[50][:accel] = [ nil, 0, 0 ]
    assert_not Imu::Assessment.call(@samples.as_json)["passed"]
  end

  test "preflight requires a matching reference and belongs to the signed-in user" do
    post api_v1_imu_checks_path, params: @payload.merge(kind: "preflight", flight_id: @flight.id), as: :json
    assert_response :unprocessable_entity
    other = User.where.not(id: users(:julien).id).first
    private_flight = other.flights.create!(name: "Other flight", status: "preparation")
    get flight_imu_check_path(private_flight)
    assert_response :not_found
    post api_v1_imu_checks_path, params: @payload.merge(flight_id: private_flight.id), as: :json
    assert_response :not_found
  end

  test "verified BNO085 gyro status zero is diagnostic and original evidence is retained" do
    @samples.each { |sample| sample[:accuracy] = [ 2, 0, 3, 3 ] }
    post api_v1_imu_checks_path, params: @payload, as: :json
    assert_response :created
    assert_equal "passed", response.parsed_body["outcome"]
    assert_equal "diagnostic_only", response.parsed_body.dig("summary", "gyro_status_role")
    assert_equal [ 2, 0, 3, 3 ], response.parsed_body.dig("summary", "accuracy_min")
    assert_equal [ 0.0, 0.0, 0.0 ], response.parsed_body.dig("summary", "gyro_mean_rad_s")
    assert_equal 0, ImuCheck.last.evidence["samples"].first["accuracy"][1]
    assert ImuCheck.reference_for(@fdr, firmware: @payload[:firmware])
    post api_v1_imu_checks_path, params: @payload.merge(uuid: SecureRandom.uuid, firmware: "fdr_integrated/57"), as: :json
    assert_response :created
    assert_equal "failed", response.parsed_body["outcome"]
    assert_match(/Gyroscope 0\/3/, response.parsed_body.dig("summary", "reason"))
  end

  test "gyro zero status never hides missing data, rest bias, noise or excessive motion" do
    @samples.each { |sample| sample[:accuracy] = [ 2, 0, 3, 3 ] }
    assessment = -> { Imu::Assessment.call(@samples.as_json, firmware: @payload[:firmware]) }
    @samples[50][:accuracy][1] = 255
    assert_not assessment.call["passed"]
    @samples[50][:accuracy][1] = 0
    @samples.each { |sample| sample[:gyro] = [ 0.01, 0, 0 ] }
    assert_match(/bias or noise/, assessment.call["reason"])
    @samples.each_with_index { |sample, i| sample[:gyro] = [ i.even? ? 0.01 : -0.01, 0, 0 ] }
    assert_match(/bias or noise/, assessment.call["reason"])
    @samples.each { |sample| sample[:gyro] = [ 0, 0, 0 ] }
    @samples[50][:gyro] = [ 0.1, 0, 0 ]
    assert_not assessment.call["passed"]
    @samples[50][:gyro] = [ 0, 0, 0 ]
    @samples[50][:quality_age] = 2000
    assert_not assessment.call["passed"]
  end

  test "incomplete tutorial cannot create a reference and changed firmware needs rechecking" do
    post api_v1_imu_checks_path, params: @payload.merge(faces: { "z+" => 4000 }), as: :json
    assert_response :unprocessable_entity
    post api_v1_imu_checks_path, params: @payload, as: :json
    assert_response :created
    assert_nil ImuCheck.reference_for(@fdr, firmware: "fdr_integrated/57")
    @fdr.update!(device_model: "Changed model")
    # Device model does not change physical assembly; firmware still scopes the reference.
    assert ImuCheck.reference_for(@fdr, firmware: @payload[:firmware])
  end
  test "live quality invalidation is retained and cannot invalidate another flight" do
    post api_v1_imu_checks_path, params: @payload, as: :json
    post api_v1_imu_checks_path, params: @payload.merge(uuid: SecureRandom.uuid, kind: "preflight", flight_id: @flight.id), as: :json
    check = ImuCheck.last
    session = SignalSession.create!(user: users(:julien), flight: @flight)
    post events_api_v1_signal_session_path(session.uuid), params: { event_uuid: SecureRandom.uuid,
      event_type: "warning", label: "IMU: quality unavailable", metadata: { source: "imu_health", invalidate_preflight_id: check.id } }, as: :json
    assert_response :created
    assert check.reload.invalidated_at
    assert check.evidence.key?("configuration")
    get flight_path(@flight)
    assert_response :success
    assert_select "td", text: /Recheck required/
  end

  test "physical installation changes invalidate the reference" do
    post api_v1_imu_checks_path, params: @payload, as: :json
    reference = ImuCheck.last
    function = Function.find_or_create_by!(code: "CONTROLLER") { |f| f.name = "Controller" }
    part = Part.create!(function:, manufacturer: "Seeed", model: "S3")
    @fdr.update!(part:)
    assert_not reference.reload.current_configuration?
    assert_nil ImuCheck.reference_for(@fdr, firmware: @payload[:firmware])
  end
  test "a level quaternion cannot hide a tilted acceleration vector" do
    samples = @samples.as_json
    samples.each { |s| s["accel"] = [ 4.903325, 0, 8.492808 ] }
    result = Imu::Assessment.call(samples)
    assert_not result["passed"]
    assert_match(/gravity/, result["reason"])
  end
end
