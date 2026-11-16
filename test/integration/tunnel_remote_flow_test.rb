require "test_helper"
require_relative "../support/method_replacement"

class TunnelRemoteFlowTest < ActionDispatch::IntegrationTest
  include MethodReplacement

  setup { sign_in_as users(:julien) }

  test "the operator chooses where the flight is saved and the choice carries to the next flight" do
    folder = FlightFolder.create!(user: users(:julien), name: "Tunnel campaign", visibility: "shared")
    foreign = FlightFolder.create!(user: users(:member), name: "Not mine", visibility: "private")

    get remote_path
    assert_select "select[name='destination'] option[selected][value='team']", text: /Public/
    assert_select "select[name='destination'] option[value='folder:#{folder.id}']", "Tunnel campaign"
    assert_select "select[name='destination'] option[value='folder:#{foreign.id}']", count: 0

    post remote_flights_path, params: { destination: "folder:#{folder.id}" }, as: :json
    assert_response :created
    flight = Flight.find(response.parsed_body.dig("flight", "id"))
    assert_equal folder, flight.folder
    assert_equal "Tunnel campaign", response.parsed_body.dig("flight", "destination")
    post end_remote_flight_path(flight), as: :json
    flight.flight_debriefs.create!(uuid: SecureRandom.uuid, user: users(:julien), status: "published")

    get remote_path
    assert_select "select[name='destination'] option[selected][value='folder:#{folder.id}']", count: 1

    post remote_flights_path, params: { destination: "private" }, as: :json
    private_flight = Flight.find(response.parsed_body.dig("flight", "id"))
    assert_nil private_flight.folder
    assert_equal "private", private_flight.visibility
    delete remote_flight_path(private_flight), as: :json

    # A folder the operator cannot contribute to is ignored; the flight stays visible to the team.
    post remote_flights_path, params: { destination: "folder:#{foreign.id}" }, as: :json
    shared = Flight.find(response.parsed_body.dig("flight", "id"))
    assert_nil shared.folder
    assert_equal "team", shared.visibility
    assert_equal "Public", response.parsed_body.dig("flight", "destination")
  end

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
    # The flight runs on the phone at once; the ground station joins when it can.
    assert_equal "flight", response.parsed_body["phase"]
    assert_not response.parsed_body.dig("flight", "recording")
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

    post end_remote_flight_path(flight), as: :json
    assert_response :success
    assert session.reload.stop_requested_at
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :success
    debrief = FlightDebrief.find(response.parsed_body.fetch("id"))

    get debrief_remote_flight_path(flight)
    assert_response :success
    assert_select ".remote-debrief .remote-item", count: DebriefChecklist::ITEMS.size
    assert_select ".remote-debrief[data-flight-debrief-autostart-value]", count: 0
    assert_select "button.remote-mic[data-action='flight-debrief#start']"
    assert_select ".remote-big", text: /Record debrief/
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
    assert_in_delta Time.current.to_f * 1000, response.parsed_body["server_time"], 5_000
    get flight_comments_path(flight)
    assert_select ".flight-debrief-checklist dd", text: "165 km/h"

    assert_difference "Flight.count", 1 do
      post remote_flights_path, params: { pilot_id: users(:julien).id }, as: :json
    end
    assert_response :created
  end

  test "runs a flight without the ground station and still debriefs it" do
    post remote_flights_path, params: { pilot_id: users(:julien).id }, as: :json
    flight = Flight.find(response.parsed_body.dig("flight", "id"))
    assert_equal "flight", response.parsed_body["phase"]

    post end_remote_flight_path(flight), as: :json
    assert_response :success
    assert_equal "debrief", response.parsed_body["phase"]
    assert flight.reload.waiting_for_recording?
    assert flight.ended_at
    get remote_pending_path, as: :json
    assert_empty response.parsed_body

    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :success
  end

  test "reads the checklist from a live transcript through the model" do
    flight = flights(:one)
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    debrief = FlightDebrief.find(response.parsed_body.fetch("id"))
    client = Object.new
    client.define_singleton_method(:checklist) { |text| { "glide_ratio" => "3", "feelings" => "IDK 9" } if text.include?("kiff") }

    replace_method(Debriefs::OpenAi, :new, -> { client }) do
      post checklist_flight_debrief_path(flight, debrief), params: { transcript: "on glissait a trois, le kiff etait a neuf" }, as: :json
    end
    assert_response :success
    assert_equal({ "glide_ratio" => "3", "feelings" => "IDK 9" }, response.parsed_body["checklist"])

    post checklist_flight_debrief_path(flight, debrief), params: { transcript: "ok" }, as: :json
    assert_empty response.parsed_body["checklist"]
  end
end
