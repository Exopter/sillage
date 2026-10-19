require "test_helper"
require_relative "../support/method_replacement"

class SignalMaterializationJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper
  include MethodReplacement

  setup do
    @at = Time.utc(2026, 10, 19)
    @session = users(:julien).signal_sessions.create!(started_at: @at)
    23.times do |index|
      Signal::IngestBatch.new(signal_session: @session, sequence: index, payload: {
        samples: [
          { kind: "gps", recorded_at: (@at + index).iso8601, latitude: 44.2, longitude: 1.3, elapsed_seconds: index },
          { kind: "sensor", recorded_at: (@at + index).iso8601, sensor_type: "RADIO", readings: { rssi: index } }
        ]
      }).call
    end
    @session.operator_events.create!(label: "Exit", occurred_at: @at)
    clear_enqueued_jobs
  end

  test "save commits a small job without reading retained payloads and processes them once" do
    sql = []
    subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") { |*args| sql << args.last[:sql] }
    assert_enqueued_with(job: SignalMaterializationJob) { save_session }
    ActiveSupport::Notifications.unsubscribe(subscriber)
    flight = @session.reload.flight
    assert_equal "processing", flight.status
    assert_equal "completed", @session.status
    assert_equal "pending", @session.materialization_status
    assert_equal 0, flight.track_points.count
    assert_equal 1, flight.operator_events.count
    assert sql.none? { |statement| statement.match?(/SELECT.*signal_batches/i) }

    assert_enqueued_with(job: SignalReconciliationJob) { SignalMaterializationJob.perform_now(@session) }
    assert_equal 23, flight.track_points.count
    assert_equal 23, flight.sensor_samples.count
    assert_equal (0...23).to_a, flight.sensor_samples.order(:id).map { |sample| sample.readings.fetch("rssi") }
    assert_equal "complete", @session.reload.materialization_status
    assert_equal "waiting_for_recording", flight.reload.status
    assert_equal 23, flight.sample_count
    assert_equal 23, flight.sensor_sample_count
    assert_equal @at + 30, flight.ended_at
    assert_no_difference [ "TrackPoint.count", "SensorSample.count", "Flight.count" ] do
      SignalMaterializationJob.perform_now(@session)
      save_session
    end
    assert_equal 23, @session.signal_batches.count
  ensure
    ActiveSupport::Notifications.unsubscribe(subscriber) if subscriber
  end

  test "an interrupted chunk rolls back and resumes after the last committed checkpoint" do
    save_session
    failure = @session.signal_batches.order(:id).last
    original = failure.payload
    failure.update!(payload: { samples: [ { kind: "gps", latitude: "invalid", longitude: 1 } ] })
    assert_raises(Signal::IngestBatch::InvalidBatch) { Signal::MaterializeSession.new(@session).call }
    assert_equal @session.signal_batches.order(:id).offset(19).first.id, @session.reload.materialized_batch_id
    assert_equal 20, @session.flight.track_points.count
    assert_equal 20, @session.flight.sensor_samples.count
    assert_equal "processing", @session.flight.status
    assert_no_enqueued_jobs only: SignalReconciliationJob
    failure.update!(payload: original)
    SignalMaterializationJob.perform_now(@session)
    assert_equal 23, @session.flight.track_points.count
    assert_equal 23, @session.flight.sensor_samples.count
    assert_equal "complete", @session.reload.materialization_status
  end

  test "a failed enqueue rolls back assignment and completion" do
    assert_no_difference "Flight.count" do
      replace_method(SignalMaterializationJob, :perform_later, ->(*) { false }) do
        assert_raises(ActiveJob::EnqueueError) { SignalSession.transaction(requires_new: true) { save_session } }
      end
    end
    assert_nil @session.reload.flight_id
    assert_equal "live", @session.status
    assert_equal 23, @session.signal_batches.count
  end

  test "saving again retries a failed materialization without resetting its progress" do
    save_session
    Signal::MaterializeSession.new(@session).call
    # Model a failure after the final data chunk but before completion.
    @session.update!(materialization_status: "failed")
    @session.flight.update!(status: "review")
    checkpoint = @session.materialized_batch_id
    assert_enqueued_with(job: SignalMaterializationJob) { save_session }
    assert_equal checkpoint, @session.reload.materialized_batch_id
    assert_no_difference([ "TrackPoint.count", "SensorSample.count" ]) { SignalMaterializationJob.perform_now(@session) }
    assert_equal "waiting_for_recording", @session.flight.reload.status
  end

  test "existing attached sessions are never rematerialized" do
    flight = flights(:one)
    @session.update!(flight:)
    assert_no_enqueued_jobs only: SignalMaterializationJob do
      Signal::CompleteSession.new(signal_session: @session, disposition: "save").call
    end
    assert_equal "complete", @session.reload.materialization_status
  end

  test "Solid Queue receipt is atomic with the saved flight" do
    original_adapter = SignalMaterializationJob.queue_adapter
    SignalMaterializationJob.queue_adapter = :solid_queue
    assert_no_difference [ "Flight.count", "SolidQueue::Job.count" ] do
      SignalSession.transaction(requires_new: true) do
        assert_difference "SolidQueue::Job.count", 1 do
          save_session
        end
        raise ActiveRecord::Rollback
      end
    end
    assert_nil @session.reload.flight_id
    assert_equal "live", @session.status
  ensure
    SignalMaterializationJob.queue_adapter = original_adapter
  end

  private

  def save_session
    Signal::CompleteSession.new(signal_session: @session, disposition: "save", name: "Range test", ended_at: @at + 30).call
  end
end
