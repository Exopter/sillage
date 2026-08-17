class ReadinessCheck
  REQUIRED_QUEUE_PROCESS_KINDS = {
    worker: ->(kind) { kind == "Worker" },
    dispatcher: ->(kind) { kind == "Dispatcher" },
    supervisor: ->(kind) { kind.start_with?("Supervisor(") }
  }.freeze

  DATABASES = {
    primary_database: ActiveRecord::Base,
    cache_database: SolidCache::Record,
    queue_database: SolidQueue::Record,
    cable_database: SolidCable::Record
  }.freeze

  def self.call(queue_processes: SolidQueue::Process.all, now: Time.current)
    checks = DATABASES.transform_values { |record_class| database_check(record_class) }
    checks[:queue_processes] = queue_process_check(queue_processes:, now:)
    checks[:object_storage] = storage_check

    {
      status: checks.values.all? { |check| check.fetch(:status) == "ok" } ? "ok" : "error",
      checks: checks
    }
  end

  def self.database_check(record_class)
    record_class.connection_pool.with_connection { |connection| connection.select_value("SELECT 1") }
    { status: "ok" }
  rescue StandardError => error
    { status: "error", error: error.class.name }
  end
  private_class_method :database_check

  def self.queue_process_check(queue_processes:, now:)
    cutoff = now - SolidQueue.process_alive_threshold
    fresh_kinds = queue_processes.filter_map do |process|
      process.kind if process.last_heartbeat_at && process.last_heartbeat_at >= cutoff
    end
    missing = REQUIRED_QUEUE_PROCESS_KINDS.filter_map do |name, matches|
      name unless fresh_kinds.any? { |kind| matches.call(kind) }
    end

    return { status: "ok" } if missing.empty?

    { status: "error", error: "MissingOrStaleHeartbeat", missing: missing }
  rescue StandardError => error
    { status: "error", error: error.class.name }
  end
  private_class_method :queue_process_check

  def self.storage_check
    service = ActiveStorage::Blob.service

    if service.respond_to?(:root)
      root = service.root.to_s
      return { status: "error", error: "StorageUnavailable" } unless File.directory?(root) && File.readable?(root) && File.writable?(root)
    else
      service.exist?("__sillage_readiness__")
    end

    { status: "ok" }
  rescue StandardError => error
    { status: "error", error: error.class.name }
  end
  private_class_method :storage_check
end
