require "test_helper"

class Signal::StartSessionTest < ActiveSupport::TestCase
  test "starts a live session on an existing flight" do
    flight = flights(:one)
    flight.update!(status: "preparation", configuration_snapshot: {})
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
    assert_equal({ "source" => "test" }, session.station_metadata)
    assert_equal flight.aircraft.configuration_snapshot, flight.configuration_snapshot
  end

  test "creates an unassigned flight and is idempotent for a supplied uuid" do
    uuid = SecureRandom.uuid
    service = -> {
      Signal::StartSession.new(user: users(:julien), uuid:, started_at: Time.current).call
    }

    assert_difference [ "Flight.count", "SignalSession.count" ], 1 do
      first = service.call
      assert_equal first, service.call
      assert_nil first.flight.aircraft
    end
  end
end
