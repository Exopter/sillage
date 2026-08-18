class FdrWifiUploadFinalizeJob < ApplicationJob
  MAX_ATTEMPTS = 5

  queue_as :default

  def perform(upload)
    return if upload.status == "complete"
    raise FdrSync::Error, "The Wi-Fi upload is not ready for verification." unless upload.status == "verifying"
    raise FdrSync::Error, "The staged Wi-Fi upload is missing." unless File.exist?(upload.staged_path)

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
        transport: "wifi_https"
      ).call
      upload.complete!(flight_import: result.flight_import)
    end
  rescue FdrSync::Error, ExoFdr::Error, ActiveRecord::RecordInvalid => error
    upload.fail!(error.message) if upload&.persisted? && upload.status != "complete"
  rescue StandardError => error
    if executions < MAX_ATTEMPTS
      retry_job wait: executions.seconds
    else
      upload.fail!(error.message) if upload&.persisted? && upload.status != "complete"
    end
  end
end
