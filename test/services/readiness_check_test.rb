require "test_helper"

class ReadinessCheckTest < ActiveSupport::TestCase
  QueueProcess = Struct.new(:kind, :last_heartbeat_at, :metadata, keyword_init: true) do
    def metadata = self[:metadata] || { "queues" => "*" }
  end

  test "reports every essential local service as healthy" do
    now = Time.current
    result = ReadinessCheck.call(
      queue_processes: [
        QueueProcess.new(kind: "Worker", last_heartbeat_at: now),
        QueueProcess.new(kind: "Dispatcher", last_heartbeat_at: now),
        QueueProcess.new(kind: "Supervisor(fork)", last_heartbeat_at: now)
      ],
      now:
    )

    assert_equal "ok", result.fetch(:status)
    assert_equal %i[database queue_processes object_storage], result.fetch(:checks).keys
    assert result.fetch(:checks).values.all? { |check| check == { status: "ok" } }
  end

  test "reports a missing or stale Solid Queue process heartbeat" do
    now = Time.current
    stale = now - SolidQueue.process_alive_threshold - 1.second

    {
      worker: [ QueueProcess.new(kind: "Worker", last_heartbeat_at: stale), QueueProcess.new(kind: "Dispatcher", last_heartbeat_at: now), QueueProcess.new(kind: "Supervisor(fork)", last_heartbeat_at: now) ],
      dispatcher: [ QueueProcess.new(kind: "Worker", last_heartbeat_at: now), QueueProcess.new(kind: "Dispatcher", last_heartbeat_at: stale), QueueProcess.new(kind: "Supervisor(fork)", last_heartbeat_at: now) ],
      supervisor: [ QueueProcess.new(kind: "Worker", last_heartbeat_at: now), QueueProcess.new(kind: "Dispatcher", last_heartbeat_at: now), QueueProcess.new(kind: "Supervisor(fork)", last_heartbeat_at: stale) ]
    }.each do |missing, queue_processes|
      result = ReadinessCheck.call(queue_processes:, now:)

      assert_equal "error", result.fetch(:status)
      assert_equal({ status: "error", error: "MissingOrStaleHeartbeat", missing: [ missing ] }, result.dig(:checks, :queue_processes))
    end
  end

  test "requires fresh workers for every application queue" do
    now = Time.current
    processes = [
      QueueProcess.new(kind: "Supervisor(fork)", last_heartbeat_at: now),
      QueueProcess.new(kind: "Dispatcher", last_heartbeat_at: now),
      QueueProcess.new(kind: "Worker", last_heartbeat_at: now, metadata: { "queues" => "default,geocoding" }),
      QueueProcess.new(kind: "Worker", last_heartbeat_at: now - 1.hour, metadata: { "queues" => "imports" })
    ]
    assert_equal({ status: "error", error: "MissingQueueWorkers", missing: [ "imports" ] }, ReadinessCheck.call(queue_processes: processes, now:).dig(:checks, :queue_processes))
    processes.last.last_heartbeat_at = now
    assert_equal "ok", ReadinessCheck.call(queue_processes: processes, now:).fetch(:status)
  end

  test "reports a sanitized database failure" do
    pool = Object.new
    pool.define_singleton_method(:with_connection) { raise ActiveRecord::ConnectionNotEstablished, "secret database details" }
    record_class = Object.new
    record_class.define_singleton_method(:connection_pool) { pool }

    result = ReadinessCheck.send(:database_check, record_class)

    assert_equal "error", result.fetch(:status)
    assert_equal "ActiveRecord::ConnectionNotEstablished", result.fetch(:error)
    assert_not_includes result.to_json, "secret database details"
  end
end
