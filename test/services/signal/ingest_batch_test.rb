require "test_helper"

class SignalIngestBatchTest < ActiveSupport::TestCase
  test "rejects malformed batch envelopes without acknowledging or persisting them" do
    session = Signal::StartSession.new(user: users(:julien)).call
    [ nil, [], {}, { samples: {} } ].each do |payload|
      assert_no_difference [ -> { SignalBatch.count }, -> { TrackPoint.count }, -> { SensorSample.count } ] do
        assert_raises(Signal::IngestBatch::InvalidBatch) do
          Signal::IngestBatch.new(signal_session: session, sequence: 0, payload:).call
        end
      end
      assert_equal(-1, session.reload.last_acknowledged_sequence)
    end
  end

  test "increments stored counts across sessions without recounting or counting replay twice" do
    user = users(:julien)
    flight = user.flights.create!(name: "Live counters", status: "live")
    first = user.signal_sessions.create!(flight:)
    second = user.signal_sessions.create!(flight:)
    payload = { samples: [ { kind: "gps", latitude: 44, longitude: 1 }, { kind: "sensor", sensor_type: "BARO", readings: { pressure: 100000 } } ] }
    counts = []
    subscriber = lambda do |_name, _start, _finish, _id, event|
      counts << event[:sql] if event[:sql].match?(/COUNT\(.*(?:track_points|sensor_samples)/i)
    end
    ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
      [ first, second, first ].each { |session| Signal::IngestBatch.new(signal_session: session, sequence: 0, payload:).call }
    end
    assert_equal 2, flight.reload.sample_count
    assert_equal 2, flight.sensor_sample_count
    assert_empty counts
  end
end
