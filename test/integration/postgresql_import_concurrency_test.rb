require "test_helper"
require "timeout"

class PostgresqlImportConcurrencyTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  test "an import transaction does not block an unrelated recorder heartbeat write" do
    user = users(:julien)
    flight_import = FlightImport.create!(user:, import_type: "exofdr", status: "pending")
    recorder = EmbeddedDevice.create!(device_id: "EXOFDR-C0FFEE")
    transaction_started = Queue.new
    release_transaction = Queue.new

    import_thread = Thread.new do
      ActiveRecord::Base.connection_pool.with_connection do
        FlightImport.transaction do
          flight_import.lock!
          flight_import.update!(status: "processing")
          transaction_started << true
          release_transaction.pop
        end
      end
    end

    Timeout.timeout(2) { transaction_started.pop }
    Timeout.timeout(2) do
      SignalPresence.create!(embedded_device: recorder, last_seen_at: Time.current, status: {})
    end

    assert recorder.signal_presence.reload.fresh?
  ensure
    release_transaction << true if release_transaction
    import_thread&.join
    SignalPresence.where(embedded_device: recorder).delete_all if recorder&.persisted?
    flight_import&.destroy!
    recorder&.destroy!
  end

  test "bulk imports use their dedicated queue" do
    assert_equal "imports", ExoFdrImportJob.new.queue_name
    assert_equal "imports", FlySightImportJob.new.queue_name
    assert_equal "default", FdrWifiUploadFinalizeJob.new.queue_name
  end
end
