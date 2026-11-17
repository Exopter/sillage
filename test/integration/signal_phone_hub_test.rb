require "test_helper"

class SignalPhoneHubTest < ActionDispatch::IntegrationTest
  PHONE = { "User-Agent" => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" }.freeze

  setup { sign_in_as users(:julien) }

  test "a phone opens Signal on the remote, with live telemetry second and the station setup one link away" do
    get signal_path, headers: PHONE
    assert_response :success
    assert_select ".signal-phone h1", "Tunnel session"
    assert_select "a.signal-phone-primary[href='#{remote_path}']", text: /Open the remote/
    assert_select ".signal-phone-secondary[aria-disabled='true']", text: /Nothing on air right now/
    assert_select ".signal-phone-foot a[href=?]", signal_path(setup: 1, view: "home"), text: "Set up on this device"
    assert_select ".signal-remote-qr", count: 0

    get signal_path(setup: 1, view: "home"), headers: PHONE
    assert_select ".signal-phone", count: 0
    assert_select ".signal-root", count: 1
  end

  test "a computer keeps the station page" do
    get signal_path
    assert_select ".signal-phone", count: 0
    assert_select ".signal-root", count: 1
  end

  test "a running flight is shown on the phone with the way back to the remote and to live telemetry" do
    flight = users(:julien).flights.create!(status: "preparation", remote_start_requested_at: 1.minute.ago)
    get signal_path, headers: PHONE
    assert_select ".signal-phone-live", text: /Flight in progress/
    assert_select ".signal-phone h1", flight.code
    assert_select "a.signal-phone-primary", text: /Back to the remote/
    assert_select ".signal-phone-secondary[aria-disabled='true']", count: 1

    flight.update!(status: "live")
    session = SignalSession.create!(user: users(:julien), flight:, uuid: SecureRandom.uuid, status: "live", started_at: Time.current)
    get signal_path, headers: PHONE
    assert_select "a.signal-phone-secondary[href='#{signal_path(session: session.uuid, watch: 1)}']", text: /Follow live telemetry/
    get signal_path(session: session.uuid, watch: 1), headers: PHONE
    assert_select ".signal-watch a.signal-watch-remote[href='#{remote_path}']", "Remote"
  end

  test "a read-only member keeps the session list on a phone" do
    delete session_path
    sign_in_as users(:member)
    get signal_path, headers: PHONE
    assert_select ".signal-phone", count: 0
  end
end
