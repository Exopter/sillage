require "test_helper"
require_relative "../support/method_replacement"

class TunnelRemoteFlowTest < ActionDispatch::IntegrationTest
  include MethodReplacement

  setup { sign_in_as users(:julien) }

  test "the remote offers each pilot only the folders that pilot can open" do
    club = FlightFolder.create!(user: users(:julien), name: "FlightClub", visibility: "club")
    mine = FlightFolder.create!(user: users(:julien), name: "Only mine", visibility: "private")
    member, outsider = users(:member), users(:operator)

    get remote_path
    assert_select "select[name='pilot_id'][data-action='change->remote#filterDestinations']", count: 1
    assert_select "option[value='folder:#{club.id}']" do |options|
      pilots = options.first["data-pilots"].split(",")
      assert_includes pilots, member.id.to_s
      assert_includes pilots, users(:julien).id.to_s
      assert_not_includes pilots, outsider.id.to_s
    end
    assert_select "option[value='folder:#{mine.id}'][data-pilots='#{users(:julien).id}']", count: 1

    post remote_flights_path, params: { destination: "folder:#{mine.id}", pilot_id: member.id }, as: :json
    assert_response :unprocessable_entity
    assert_match(/cannot access this folder/, response.parsed_body["error"])
    post remote_flights_path, params: { destination: "folder:#{club.id}", pilot_id: member.id }, as: :json
    assert_response :created
    assert_equal club, Flight.find(response.parsed_body.dig("flight", "id")).folder
  end

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
    assert_nil flight.name, "a flight carries a description only when someone writes one"

    # A station that hears nothing is not handed the flight; hearing an aircraft is all it takes.
    station = SecureRandom.uuid
    post remote_station_path, params: { key: station, ready: false }, as: :json
    assert_empty response.parsed_body
    get remote_state_path, as: :json
    assert_equal "waiting", response.parsed_body.dig("station", "state")

    post remote_station_path, params: { key: station, ready: true, device_id: "ECU-0123456789AB", aircraft: "Freak 6", environment: "tunnel", tunnel_glide_ratio: "2.99" }, as: :json
    assert_equal flight.id, response.parsed_body["flight_id"]
    assert_equal 1, SignalStation.count
    get remote_state_path, as: :json
    assert_equal({ "state" => "ready", "aircraft" => "Freak 6", "environment" => "tunnel", "tunnel_glide_ratio" => 2.99 }, response.parsed_body["station"])
    travel SignalStation::FRESHNESS + 1.second do
      get remote_state_path, as: :json
      assert_equal "offline", response.parsed_body.dig("station", "state")
    end
    post remote_station_path, params: { key: "not-a-key", ready: true }, as: :json
    assert_response :unprocessable_entity

    assert_no_difference "Flight.count" do
      post remote_flights_path, params: { pilot_id: users(:julien).id }, as: :json
    end
    assert_response :conflict

    delete remote_flight_path(flight), as: :json
    assert_response :success
    assert_equal "ready", response.parsed_body["phase"]
    post remote_station_path, params: { key: station, ready: true }, as: :json
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
    # The live connection opens with the screen; recording still waits for the tap.
    assert_select ".remote-debrief[data-flight-debrief-prewarm-value='true']", count: 1
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
    assert_equal({ "speed" => "165 km/h" }, debrief.reload.checklist)

    get remote_state_path, as: :json
    assert_equal "ready", response.parsed_body["phase"]
    assert_equal 1, response.parsed_body["flights_today"]
    assert_in_delta Time.current.to_f * 1000, response.parsed_body["server_time"], 5_000
    get flight_comments_path(flight)
    assert_select ".flight-debrief-checklist dd", text: "165 km/h"
    # Points the pilot did not cover keep their cell.
    assert_select ".flight-debrief-checklist > div", count: DebriefChecklist::ITEMS.size
    assert_select ".flight-debrief-checklist dt", text: "AoA setting", count: 1

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
    post remote_station_path, params: { key: SecureRandom.uuid, ready: true }, as: :json
    assert_empty response.parsed_body

    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :success
  end

  test "a reservation opened early and never used does not block the next recording" do
    flight = flights(:one)
    stale = flight.flight_debriefs.create!(uuid: SecureRandom.uuid, user: users(:operator))
    fresh = SecureRandom.uuid
    post flight_debriefs_path(flight), params: { uuid: fresh }, as: :json
    assert_response :conflict

    stale.update_columns(updated_at: 31.minutes.ago)
    post flight_debriefs_path(flight), params: { uuid: fresh }, as: :json
    assert_response :success
    assert_not FlightDebrief.exists?(stale.id)

    delete flight_debrief_path(flight, FlightDebrief.find_by!(uuid: fresh))
    assert_response :no_content
  end

  test "the operator's own unused reservation gives way at once, a recording stays" do
    flight = flights(:one)
    # The phone records first and reserves in the background: its own leftover must not strand the audio.
    unused = flight.flight_debriefs.create!(uuid: SecureRandom.uuid, user: users(:julien))
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :success
    assert_not FlightDebrief.exists?(unused.id)

    recorded = FlightDebrief.find(response.parsed_body.fetch("id"))
    recorded.audio.attach(io: StringIO.new("audio"), filename: "debrief.webm", content_type: "audio/webm")
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :success
    assert FlightDebrief.exists?(recorded.id)
  end

  test "a debrief whose audio never arrives is written from the words heard live, and the audio replaces them" do
    flight = flights(:one)
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    debrief = FlightDebrief.find(response.parsed_body.fetch("id"))
    post live_flight_debrief_path(flight, debrief), params: { transcript: "Quatre\nFeed 150.\nCG\nTrois point five", checklist: { speed: "150 km/h", admin: "1" } }, as: :json
    assert_response :no_content
    assert_equal "Quatre\nFeed 150.\nCG\nTrois point five", debrief.reload.transcript
    assert_equal({ "speed" => "150 km/h" }, debrief.checklist)

    # Its words make it a debrief: another recording of the operator does not sweep it away.
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    assert_response :success
    assert FlightDebrief.exists?(debrief.id)
    FlightDebrief.find(response.parsed_body.fetch("id")).destroy!

    FlightDebrief.publish_heard_without_audio!
    assert_equal "recording", debrief.reload.status, "the phone is given time to deliver the audio"

    client = Object.new
    client.define_singleton_method(:summarize) { |text| "Summary of: #{text.lines.first.strip}" }
    client.define_singleton_method(:checklist) { |_| { "glide_ratio" => "4", "speed" => "150 km/h", "cg" => "3.5" } }
    client.define_singleton_method(:transcribe) { |_| "Glide ratio quatre, speed 150, CG trois point five." }
    debrief.update_columns(updated_at: 11.minutes.ago)
    replace_method(Debriefs::OpenAi, :new, -> { client }) do
      perform_enqueued_jobs { FlightDebrief.publish_heard_without_audio! }
    end
    assert_equal "published", debrief.reload.status
    assert_equal "Summary of: Quatre", debrief.flight_comment.body
    assert_equal({ "glide_ratio" => "4", "speed" => "150 km/h", "cg" => "3.5" }, debrief.checklist)
    get flight_comments_path(flight)
    assert_select ".flight-debrief-note", text: /audio did not reach the server/
    assert_select ".flight-debrief-transcript summary", text: "Live transcript"
    assert_select "audio.flight-debrief-audio", count: 0

    # The phone finally delivers the recording: the entry is rewritten from it.
    replace_method(Debriefs::OpenAi, :new, -> { client }) do
      perform_enqueued_jobs do
        debrief.audio.attach(io: StringIO.new("audio"), filename: "debrief.webm", content_type: "audio/webm")
        debrief.update!(status: "uploaded")
        post process_audio_flight_debrief_path(flight, debrief), as: :json
        assert_response :success
      end
    end
    assert_equal "Glide ratio quatre, speed 150, CG trois point five.", debrief.reload.transcript
    assert_equal "Summary of: Glide ratio quatre, speed 150, CG trois point five.", debrief.flight_comment.body
    get flight_comments_path(flight)
    assert_select ".flight-debrief-transcript summary", text: "Full transcript"
    assert_select "audio.flight-debrief-audio", count: 1
  end

  test "the phone builds the debrief screen from a copy already on the remote" do
    get remote_path
    assert_response :success
    assert_select "template[data-remote-target='debriefTemplate']" do |templates|
      copy = templates.first.inner_html
      assert_includes copy, 'data-flight-debrief-url-value="/flights/FLIGHT_ID/debriefs"'
      assert_includes copy, %(data-flight-debrief-key-value="#{users(:julien).id}:FLIGHT_ID")
      assert_includes copy, 'data-flight-debrief-autosend-value="true"'
      assert_includes copy, 'data-flight-code="FLIGHT_CODE"'
    end
  end

  test "reads the checklist from a live transcript through the model" do
    flight = flights(:one)
    post flight_debriefs_path(flight), params: { uuid: SecureRandom.uuid }, as: :json
    debrief = FlightDebrief.find(response.parsed_body.fetch("id"))
    client = Object.new
    efforts = []
    client.define_singleton_method(:checklist) { |text, effort: "low"| efforts << effort; { "glide_ratio" => "3", "feelings" => "IDK 9" } if text.include?("kiff") }

    replace_method(Debriefs::OpenAi, :new, -> { client }) do
      post checklist_flight_debrief_path(flight, debrief), params: { transcript: "on glissait a trois, le kiff etait a neuf" }, as: :json
    end
    assert_response :success
    assert_equal({ "glide_ratio" => "3", "feelings" => "IDK 9" }, response.parsed_body["checklist"])
    # The live reading asks the model for speed, not depth.
    assert_equal [ "none" ], efforts

    post checklist_flight_debrief_path(flight, debrief), params: { transcript: "ok" }, as: :json
    assert_empty response.parsed_body["checklist"]
  end
end
