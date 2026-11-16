require "test_helper"

class TunnelRemoteFlowTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:julien) }

  test "starts a flight from the phone, lets the ground station pick it up and withdraws it on cancel" do
    get remote_path
    assert_response :success
    assert_select ".remote[data-controller='remote'] .remote-big", text: /Start flight/
    assert_select "select[name='pilot_id'] option[selected]", text: users(:julien).full_name || users(:julien).email_address

    assert_difference "Flight.count", 1 do
      post remote_flights_path, params: { pilot_id: users(:julien).id }, as: :json
    end
    assert_response :created
    flight = Flight.find(response.parsed_body.dig("flight", "id"))
    assert_equal "starting", response.parsed_body["phase"]
    assert flight.preparation?
    assert_equal users(:julien), flight.pilot

    get remote_pending_path, as: :json
    assert_equal flight.id, response.parsed_body["flight_id"]

    assert_no_difference "Flight.count" do
      post remote_flights_path, params: { pilot_id: users(:julien).id }, as: :json
    end
    assert_response :conflict

    delete remote_flight_path(flight), as: :json
    assert_response :success
    assert_equal "ready", response.parsed_body["phase"]
    get remote_pending_path, as: :json
    assert_empty response.parsed_body
  end

  test "follows the flight, opens the debrief as soon as a stop is requested and chains the next flight" do
    post remote_flights_path, params: { pilot_id: users(:julien).id }, as: :json
    flight = Flight.find(response.parsed_body.dig("flight", "id"))
    session = users(:julien).signal_sessions.create!(uuid: SecureRandom.uuid, flight:, started_at: 2.minutes.ago, station_metadata: {})
    session.update_columns(gateway_seen_at: Time.current)
    flight.update!(status: "live", started_at: session.started_at)

    get remote_state_path, as: :json
    assert_equal "flight", response.parsed_body["phase"]
    assert response.parsed_body.dig("session", "gateway_connected")

    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :conflict

    post response_stop_url(session), as: :json
    assert_response :success
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :success
    debrief = FlightDebrief.find(response.parsed_body.fetch("id"))

    get debrief_remote_flight_path(flight)
    assert_response :success
    assert_select ".remote-debrief[data-flight-debrief-autostart-value='true'] .remote-item", count: DebriefChecklist::ITEMS.size
    assert_select ".remote-big", text: "Save and next flight"

    session.update!(status: "completed", ended_at: Time.current)
    flight.update!(status: "waiting_for_recording")
    get remote_state_path, as: :json
    assert_equal "debrief", response.parsed_body["phase"]

    debrief.audio.attach(io: StringIO.new("audio evidence"), filename: "original.webm", content_type: "audio/webm")
    debrief.update!(status: "uploaded")
    post process_audio_flight_debrief_path(flight, debrief), params: { checklist: { speed: "165 km/h", pilot: "Julien", injected: "x" } }, as: :json
    assert_response :success
    assert_equal({ "speed" => "165 km/h", "pilot" => "Julien" }, debrief.reload.checklist)

    get remote_state_path, as: :json
    assert_equal "ready", response.parsed_body["phase"]
    assert_equal 1, response.parsed_body["flights_today"]
    get flight_comments_path(flight)
    assert_select ".flight-debrief-checklist dd", text: "165 km/h"

    assert_difference "Flight.count", 1 do
      post remote_flights_path, params: { pilot_id: users(:julien).id }, as: :json
    end
    assert_response :created
  end

  private

  def response_stop_url(session)
    request_stop_api_v1_signal_session_path(session.uuid)
  end
end
