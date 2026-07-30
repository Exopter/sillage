require "test_helper"

class SignalFlowTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:julien) }

  test "creates an idempotent live session and completes its flight" do
    flight = flights(:one)
    flight.update!(status: "preparation")
    uuid = SecureRandom.uuid

    post api_v1_signal_sessions_path, params: { uuid:, flight_id: flight.id, started_at: Time.current.iso8601 }, as: :json

    assert_response :created
    session = SignalSession.find_by!(uuid:)
    assert_equal flight, session.flight
    assert_equal "live", flight.reload.status

    payload = {
      sequence: 0,
      first_received_at: Time.current.iso8601,
      last_received_at: Time.current.iso8601,
      telemetry_system_id: aircraft(:pilatus).telemetry_system_id,
      position: { latitude: landing_zones(:tournon).latitude, longitude: landing_zones(:tournon).longitude },
      samples: [
        { kind: "gps", recorded_at: Time.current.iso8601, latitude: 44.1994, longitude: 5.7168, altitude_m: 1_480, heading_deg: 36, gps_fix: 3, satellite_count: 12 },
        { kind: "sensor", sensor_type: "VFR_HUD", recorded_at: Time.current.iso8601, readings: { airspeedMps: 59.4 } }
      ]
    }

    assert_difference -> { session.signal_batches.count }, 1 do
      assert_difference -> { flight.track_points.count }, 1 do
        assert_difference -> { flight.sensor_samples.count }, 1 do
          post batches_api_v1_signal_session_path(uuid), params: payload, as: :json
          assert_response :success
        end
      end
    end
    assert_equal 0, response.parsed_body.fetch("acknowledged_sequence")

    assert_no_difference -> { session.signal_batches.count } do
      assert_no_difference -> { flight.track_points.count } do
        post batches_api_v1_signal_session_path(uuid), params: payload, as: :json
        assert_response :success
      end
    end

    event_uuid = SecureRandom.uuid
    assert_difference -> { session.operator_events.count }, 1 do
      post events_api_v1_signal_session_path(uuid), params: { event_uuid:, label: "Operator marker" }, as: :json
      assert_response :created
    end
    assert_no_difference -> { session.operator_events.count } do
      post events_api_v1_signal_session_path(uuid), params: { event_uuid:, label: "Operator marker" }, as: :json
      assert_response :created
    end

    patch complete_api_v1_signal_session_path(uuid), params: { ended_at: Time.current.iso8601 }, as: :json

    assert_response :success
    assert_equal "completed", session.reload.status
    assert_equal "processing", flight.reload.status
  end

  test "a first live batch identifies an unassigned aircraft and landing zone" do
    post api_v1_signal_sessions_path, params: { uuid: SecureRandom.uuid }, as: :json
    session = SignalSession.order(:created_at).last
    assert_nil session.flight.aircraft
    assert_nil session.flight.landing_zone

    post batches_api_v1_signal_session_path(session.uuid), params: {
      sequence: 0,
      telemetry_system_id: aircraft(:pilatus).telemetry_system_id,
      position: { latitude: landing_zones(:tournon).latitude, longitude: landing_zones(:tournon).longitude },
      samples: []
    }, as: :json

    assert_response :success
    assert_equal aircraft(:pilatus), session.flight.reload.aircraft
    assert_equal landing_zones(:tournon), session.flight.landing_zone
  end

  test "renders the unified Signal workspace without view tabs" do
    flight = flights(:one)
    session = users(:julien).signal_sessions.create!(flight:)

    get signal_path(session: session.uuid)

    assert_response :success
    assert_select ".signal-widget[data-widget='map']"
    assert_select ".signal-widget[data-widget='instruments']"
    assert_select ".signal-widget[data-widget='charts']"
    assert_select ".signal-mode-buttons button", text: "Large", minimum: 3
    assert_select ".signal-telemetry-strip", count: 1
    assert_select ".signal-tabs", count: 0
  end
end
