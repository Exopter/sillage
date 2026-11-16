require "test_helper"

class SharedFlightDebriefTest < ActionDispatch::IntegrationTest
  setup { sign_in_as_admin(users(:julien)) }

  test "starts one flight and lets another device request a confirmed stop" do
    assert_difference "Flight.count", 1 do
      post api_v1_signal_sessions_path, params: { device_id: signal_recorder.device_id, uuid: SecureRandom.uuid }, as: :json
      assert_response :created
    end
    uuid = response.parsed_body.fetch("uuid")
    assert_no_difference "SignalSession.count" do
      post api_v1_signal_sessions_path, params: { device_id: signal_recorder.device_id, uuid: SecureRandom.uuid }, as: :json
      assert_equal uuid, response.parsed_body.fetch("uuid")
    end
    get signal_path(session: uuid, join: 1)
    assert_response :success
    assert_select "[data-controller=shared-flight]", count: 1
    flight = SignalSession.find_by!(uuid:).flight
    post flight_debriefs_path(flight), params: { device_id: signal_recorder.device_id, uuid: SecureRandom.uuid }, as: :json
    assert_response :conflict
    token = SecureRandom.uuid
    post gateway_api_v1_signal_session_path(uuid), params: { token: }, as: :json
    assert_response :success
    post gateway_api_v1_signal_session_path(uuid), params: { token: SecureRandom.uuid }, as: :json
    assert_response :conflict
    post request_stop_api_v1_signal_session_path(uuid), as: :json
    assert_response :success
    assert_equal "live", SignalSession.find_by!(uuid:).status
    patch complete_api_v1_signal_session_path(uuid), params: { disposition: "save" }, as: :json
    assert_response :conflict
    patch complete_api_v1_signal_session_path(uuid), params: { disposition: "save" }, headers: { "X-Signal-Gateway" => token }, as: :json
    assert_response :success
    assert_equal "completed", SignalSession.find_by!(uuid:).status
  end

  test "closing a disconnected flight retains late batches without reopening it" do
    session = Signal::StartSession.new(device_id: signal_recorder.device_id, user: users(:julien)).call
    post close_disconnected_api_v1_signal_session_path(session.uuid), as: :json
    assert_response :success
    assert_equal "completed", session.reload.status
    post batches_api_v1_signal_session_path(session.uuid), params: {
      sequence: 0, samples: [ { kind: "gps", recorded_at: 1.minute.ago.iso8601, latitude: 44.2, longitude: 5.7 } ]
    }, as: :json
    assert_response :success
    assert_equal 1, session.signal_batches.count
    assert_not_equal "live", session.flight.reload.status
    post api_v1_signal_sessions_path, params: { device_id: signal_recorder.device_id, uuid: SecureRandom.uuid }, as: :json
    assert_response :created
    assert_not_equal session.uuid, response.parsed_body.fetch("uuid")
  end

  test "legacy unassigned sessions can be joined and explicitly closed" do
    session = users(:julien).signal_sessions.create!
    get signal_path(session: session.uuid, join: 1)
    assert_response :success
    assert_select "[data-shared-flight-target=flightLink] a", count: 0
    get shared_state_api_v1_signal_session_path(session.uuid), as: :json
    assert_response :success
    assert_nil response.parsed_body["flight_url"]
    post close_disconnected_api_v1_signal_session_path(session.uuid), as: :json
    assert_response :success
    assert session.reload.flight
    assert response.parsed_body["flight_url"].present?
  end

  test "adds the Pilot log entry as soon as the audio is stored, before the summary exists" do
    flight = flights(:one)
    post flight_debriefs_path(flight), params: { device_id: signal_recorder.device_id, uuid: SecureRandom.uuid }, as: :json
    assert_response :success
    debrief = FlightDebrief.find(response.parsed_body.fetch("id"))
    debrief.audio.attach(io: StringIO.new("audio evidence"), filename: "original.webm", content_type: "audio/webm")
    debrief.update!(status: "uploaded")

    assert_difference "FlightComment.count", 1 do
      assert_enqueued_with(job: FlightDebriefJob) do
        2.times do
          post process_audio_flight_debrief_path(flight, debrief), as: :json
          assert_response :success
        end
      end
    end
    assert response.parsed_body.fetch("published")
    assert_equal FlightDebrief::PENDING_SUMMARY, debrief.reload.flight_comment.body

    get flight_comments_path(flight)
    assert_response :success
    assert_select ".flight-debrief-entry .flight-debrief-pending[data-controller='debrief-summary']", text: /Writing the summary/
    assert_select ".flight-debrief-entry audio"
    assert_select ".flight-debrief-summary", count: 0
  end

  test "publishes a debrief once and retains the original audio" do
    flight = flights(:one)
    post flight_debriefs_path(flight), params: { device_id: signal_recorder.device_id, uuid: SecureRandom.uuid }, as: :json
    assert_response :success
    debrief = FlightDebrief.find(response.parsed_body.fetch("id"))
    debrief.audio.attach(io: StringIO.new("audio evidence"), filename: "original.webm", content_type: "audio/webm")
    debrief.update!(status: "ready", transcript: "A stable flight.", summary: "Stable flight.")
    assert_difference "FlightComment.count", 1 do
      2.times do
        post publish_flight_debrief_path(flight, debrief), params: { summary: "Reviewed summary." }, as: :json
        assert_response :success
      end
    end
    assert_equal "Reviewed summary.", debrief.reload.flight_comment.body
    assert_equal "audio evidence", debrief.audio.download
  end

  test "refuses a second recorder and hides a private debrief" do
    flight = flights(:one)
    post flight_debriefs_path(flight), params: { device_id: signal_recorder.device_id, uuid: SecureRandom.uuid }, as: :json
    id = response.parsed_body.fetch("id")
    post flight_debriefs_path(flight), params: { device_id: signal_recorder.device_id, uuid: SecureRandom.uuid }, as: :json
    assert_response :conflict
    sign_in_as_admin(users(:operator))
    get flight_debrief_path(flight, id), as: :json
    assert_response :not_found
  end
end
