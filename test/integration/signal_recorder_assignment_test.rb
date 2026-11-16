require "test_helper"

class SignalRecorderAssignmentTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as users(:julien)
    @device_id = "ECU-441BF685BEC8"
    @assembly = create_exofdr_assembly
  end

  test "a session needs an identified recorder but no registration or assembly" do
    assert_no_difference [ "SignalSession.count", "EmbeddedController.count" ] do
      post api_v1_signal_sessions_path, params: { device_id: nil, uuid: SecureRandom.uuid }, as: :json
      assert_response :unprocessable_entity
    end

    assert_no_difference "EmbeddedController.count" do
      post api_v1_signal_sessions_path, params: { device_id: @device_id, uuid: SecureRandom.uuid }, as: :json
      assert_response :created
    end
    session = SignalSession.find_by!(uuid: response.parsed_body.fetch("uuid"))
    assert_equal @device_id, session.station_metadata["recorder_device_id"]
    assert_nil session.station_metadata["recorder_assembly_id"]
    assert_nil session.flight.fdr
    assert_predicate session.flight, :live?

    post batches_api_v1_signal_session_path(session.uuid), params: {
      sequence: 0, device_id: @device_id, samples: [ { kind: "gps", recorded_at: 1.minute.ago.iso8601, latitude: 44.2, longitude: 5.7 } ]
    }, as: :json
    assert_response :success

    get signal_path(session: session.uuid, join: 1)
    assert_response :success
    get flight_path(session.flight)
    assert_response :success
  end

  test "a registered recorder without an assembly can start from the Signal home" do
    EmbeddedController.create!(device_id: @device_id)
    get api_v1_fdr_registration_path, params: { device_id: @device_id }, as: :json
    assert_equal true, response.parsed_body.dig("recorder", "acquisition_allowed")
    assert_nil response.parsed_body.dig("recorder", "assembly_id")
    assert_difference "SignalSession.count", 1 do
      post signal_sessions_path, params: { device_id: @device_id }
    end
    assert_response :redirect
  end

  test "confirming an empty assembly registers and binds the recorder atomically" do
    assert_difference [ "EmbeddedController.count", "FdrBoardInstallation.count" ], 1 do
      assign(assembly_id: @assembly.id)
      assert_response :success
    end
    recorder = EmbeddedController.find_by!(device_id: @device_id)
    assert_equal @assembly, recorder.assembly
    assert_equal "signal", recorder.device_activities.find_by!(event_type: "fdr_bound").source
    get api_v1_fdr_registration_path, params: { device_id: @device_id }, as: :json
    assert_equal true, response.parsed_body.dig("recorder", "acquisition_allowed")
    post api_v1_signal_sessions_path, params: { device_id: @device_id }, as: :json
    assert_response :created
    session = SignalSession.find_by!(uuid: response.parsed_body.fetch("uuid"))
    assert_equal @device_id, session.station_metadata["recorder_device_id"]
    assert_equal @assembly.id, session.station_metadata["recorder_assembly_id"]
  end

  test "occupied assemblies and replacement flags cannot replace a board" do
    occupant = create_embedded_controller(assembly: @assembly, device_id: "ECU-112233445566")
    [ {}, { replace_board: "1" } ].each do |options|
      assert_no_difference [ "EmbeddedController.count", "FdrBoardInstallation.count", "DeviceActivity.count" ] do
        assign(**options, assembly_id: @assembly.id)
        assert_response :unprocessable_entity
      end
      assert_equal occupant, @assembly.reload.embedded_controller
      assert_nil EmbeddedController.find_by(device_id: @device_id)
    end
  end

  test "creating a physical assembly and binding it is one confirmed operation" do
    configuration = create_fdr_functional_configuration(version: 2)
    assert_difference [ "Assembly.count", "EmbeddedController.count", "FdrBoardInstallation.count" ], 1 do
      assign(configuration_id: configuration.id, fdr_component_type: "SEAT")
      assert_response :success
    end
    recorder = EmbeddedController.find_by!(device_id: @device_id)
    assert_equal "SEAT", recorder.assembly.fdr_component_type
    assert_equal 2, recorder.assembly.fdr_functional_configuration.version
    assert_no_difference [ "Assembly.count", "EmbeddedController.count", "FdrBoardInstallation.count" ] do
      assign(configuration_id: configuration.id, fdr_component_type: "SEAT")
      assert_response :unprocessable_entity
    end
  end

  test "logical systems cannot be used as physical board assignments" do
    configuration = create_fdr_functional_configuration(version: 2)
    assert_no_difference [ "Assembly.count", "EmbeddedController.count", "FdrBoardInstallation.count" ] do
      assign(configuration_id: configuration.id, fdr_component_type: "SYSTEMS")
      assert_response :unprocessable_entity
    end
  end

  test "an assigned recorder cannot be silently moved to another empty assembly" do
    assign(assembly_id: @assembly.id)
    another = create_exofdr_assembly
    assert_no_difference "FdrBoardInstallation.count" do
      assign(assembly_id: another.id)
      assert_response :unprocessable_entity
    end
    assert_equal @assembly, EmbeddedController.find_by!(device_id: @device_id).assembly
  end

  test "removing the assignment stops new batches but retains existing samples" do
    assign(assembly_id: @assembly.id)
    post api_v1_signal_sessions_path, params: { device_id: @device_id }, as: :json
    uuid = response.parsed_body.fetch("uuid")
    post batches_api_v1_signal_session_path(uuid), params: { sequence: 0, device_id: @device_id, samples: [] }, as: :json
    assert_response :success
    EmbeddedController.find_by!(device_id: @device_id).active_fdr_board_installation.update!(removed_at: 1.second.from_now)
    assert_no_difference "SignalBatch.count" do
      post batches_api_v1_signal_session_path(uuid), params: { sequence: 1, device_id: @device_id, samples: [] }, as: :json
      assert_response :unprocessable_entity
      assert_equal "recorder_assignment_required", response.parsed_body["code"]
    end
    assert_equal 1, SignalSession.find_by!(uuid:).signal_batches.count
  end

  test "wrong source and unbound legacy sessions cannot ingest new telemetry" do
    session = create_signal_session
    [ { device_id: @device_id, samples: [] }, { samples: [ { kind: "sensor", sensor_type: "IMU_QUALITY", readings: { deviceId: @device_id } } ] } ].each do |payload|
      post batches_api_v1_signal_session_path(session.uuid), params: payload.merge(sequence: 0), as: :json
      assert_response :unprocessable_entity
    end
    legacy = SignalSession.create!(user: users(:julien))
    post batches_api_v1_signal_session_path(legacy.uuid), params: { sequence: 0, samples: [] }, as: :json
    assert_response :unprocessable_entity
    assert_equal 0, legacy.signal_batches.count
  end

  test "a different assigned recorder cannot take over the current live acquisition" do
    session = Signal::StartSession.new(user: users(:julien), device_id: signal_recorder.device_id).call
    assign(assembly_id: @assembly.id)
    assert_no_difference "SignalSession.count" do
      post api_v1_signal_sessions_path, params: { device_id: @device_id }, as: :json
      assert_response :unprocessable_entity
    end
    assert_equal signal_recorder.device_id, session.reload.station_metadata["recorder_device_id"]
    get signal_path(session: session.uuid, join: 1)
    assert_response :success
    assert_select "[data-controller=shared-flight]", count: 1
  end

  test "read-only accounts cannot assign recorders" do
    sign_in_as users(:operator)
    assert_no_difference [ "EmbeddedController.count", "FdrBoardInstallation.count" ] do
      assign(assembly_id: @assembly.id)
      assert_response :forbidden
    end
  end

  private

  def assign(**attributes)
    post api_v1_signal_recorder_assignment_path, params: attributes.merge(device_id: @device_id), as: :json
  end
end
