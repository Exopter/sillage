require "test_helper"

class SharedFlightDebriefTest < ActionDispatch::IntegrationTest
  setup { sign_in_as_admin(users(:julien)) }

  test "starts one flight and lets another device request a confirmed stop" do
    assert_difference "Flight.count", 1 do
      post api_v1_signal_sessions_path, params: { uuid: SecureRandom.uuid }, as: :json
      assert_response :created
    end
    uuid = response.parsed_body.fetch("uuid")
    assert_no_difference "SignalSession.count" do
      post api_v1_signal_sessions_path, params: { uuid: SecureRandom.uuid }, as: :json
      assert_equal uuid, response.parsed_body.fetch("uuid")
    end
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

  test "publishes a debrief once and retains the original audio" do
    flight = flights(:one)
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
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
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    id = response.parsed_body.fetch("id")
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :conflict
    sign_in_as_admin(users(:operator))
    get flight_debrief_path(flight, id), as: :json
    assert_response :not_found
  end
end
