require "test_helper"

class Signal::StartSessionTest < ActiveSupport::TestCase
  test "a collaborator starts a session on a visible flight and retains acquisition attribution" do
    flight = flights(:one)
    flight.update!(status: "preparation", visibility: "team")
    flight.update!(pilot: users(:member))
    session = Signal::StartSession.new(user: users(:operator), flight_id: flight.id).call
    assert_equal flight, session.flight
    assert_equal users(:operator), session.user
    assert_equal users(:julien), flight.reload.user
    assert_equal users(:member), flight.pilot
    flight.update!(visibility: "private")
    assert_raises(Signal::StartSession::InvalidFlight) do
      Signal::StartSession.new(user: users(:operator), flight_id: flight.id).call
    end
  end

  test "starts a live session on an existing flight" do
    flight = flights(:one)
    flight.update!(status: "preparation", configuration_snapshot: {}, visibility: "team")
    started_at = Time.zone.parse("2026-08-18 10:00:00")

    session = Signal::StartSession.new(
      user: users(:julien),
      flight_id: flight.id,
      uuid: SecureRandom.uuid,
      started_at:,
      station_metadata: { "source" => "test" }
    ).call

    assert_equal flight, session.flight
    assert_equal "live", flight.reload.status
    assert_equal "team", flight.visibility
    assert_equal({ "source" => "test" }, session.station_metadata)
    assert_equal flight.aircraft.configuration_snapshot, flight.configuration_snapshot
  end

  test "creates a live flight and is idempotent for a supplied uuid" do
    uuid = SecureRandom.uuid
    service = -> {
      Signal::StartSession.new(user: users(:julien), uuid:, started_at: Time.current).call
    }

    assert_difference "Flight.count", 1 do
      assert_difference "SignalSession.count", 1 do
        first = service.call
        assert_equal first, service.call
        assert_equal "live", first.flight.status
      end
    end
  end
end
