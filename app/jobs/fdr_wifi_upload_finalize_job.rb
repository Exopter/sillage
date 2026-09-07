class FdrWifiUploadFinalizeJob < ApplicationJob
  MAX_ATTEMPTS = 5

  queue_as :imports
  self.enqueue_after_transaction_commit = false
  discard_on ActiveJob::DeserializationError

  def perform(upload)
    upload.with_lock do
      next if upload.status == "complete"
      return unless upload.status == "verifying"
      raise IOError, "The staged Wi-Fi upload is missing." unless File.exist?(upload.staged_path)

      File.open(upload.staged_path, "rb") do |file|
        source = ActionDispatch::Http::UploadedFile.new(
          tempfile: file,
          filename: upload.filename,
          type: "application/octet-stream"
        )
        result = FdrSync::Ingest.new(
          user: User.default_admin,
          upload: source,
          metadata: upload.ingest_metadata,
          transport: "wifi_https",
          enqueue: false
        ).call
        ExoFdr::ImportService.new(result.flight_import).call
        upload.complete!(flight_import: result.flight_import)
      end
    end
    upload.purge_completed_source!
  rescue FdrSync::Error, ExoFdr::Error => error
    upload.with_lock { upload.fail!(error.message) if upload.status == "verifying" }
  rescue StandardError => error
    if executions < MAX_ATTEMPTS
      retry_job wait: executions.seconds
    else
      upload.with_lock { upload.fail!(error.message, retryable: true) if upload.status == "verifying" }
    end
  end
end
