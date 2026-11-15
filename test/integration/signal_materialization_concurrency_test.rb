require "test_helper"
require "timeout"

class SignalMaterializationConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  test "concurrent workers materialize each retained batch exactly once" do
    configuration_existed = FdrFunctionalConfiguration.exists?(version: 0)
    function_existed = Function.exists?(code: "CONTROLLER")
    session = create_signal_session(started_at: Time.current)
    25.times do |i|
      Signal::IngestBatch.new(signal_session: session, sequence: i, payload: { samples: [
        { kind: "gps", latitude: 44, longitude: 1, elapsed_seconds: i },
        { kind: "sensor", sensor_type: "RADIO", readings: { rssi: i } }
      ] }).call
    end
    Signal::CompleteSession.new(signal_session: session, disposition: "save").call
    ready = Queue.new
    start = Queue.new
    threads = 2.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ready << true
          start.pop
          Signal::MaterializeSession.new(SignalSession.find(session.id)).call
        end
      end
    end
    Timeout.timeout(5) { 2.times { ready.pop } }
    2.times { start << true }
    Timeout.timeout(10) { threads.each(&:value) }
    assert_equal "complete", session.reload.materialization_status
    assert_equal 25, session.flight.track_points.count
    assert_equal 25, session.flight.sensor_samples.count
    assert_equal 25, session.flight.sample_count
    assert_equal "waiting_for_recording", session.flight.status
  ensure
    threads&.each { |thread| thread.join(2) || thread.kill }
    flight = session&.reload&.flight
    session&.destroy!
    flight&.destroy!
    if (recorder = @signal_recorder)
      assembly = recorder.assembly
      part = recorder.part
      DeviceActivity.where(embedded_controller: recorder).delete_all
      FdrBoardInstallation.where(embedded_controller: recorder).delete_all
      recorder.destroy!
      PartInstallation.where(part:).delete_all
      part.reload.destroy!
      assembly.reload.destroy!
      FdrFunctionalConfiguration.find_by(version: 0)&.destroy! unless configuration_existed
      Function.find_by(code: "CONTROLLER")&.destroy! unless function_existed
    end
  end
end
