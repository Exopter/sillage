class TunnelMediaSyncJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: "tunnel_media_sync", duration: 30.minutes

  retry_on TunnelMedia::Client::Error, wait: :polynomially_longer, attempts: 3 do |_job, error|
    Rails.logger.warn("Tunnel media sync failed: #{error.message}")
  end

  def perform
    configuration = TunnelMedia::Configuration.from_env
    return unless configuration.configured? && TunnelMedia::Sync.awaiting_clips?(configuration)

    result = TunnelMedia::Sync.new(configuration:).call
    Rails.logger.info("Tunnel media sync: #{result.discovered} discovered, #{result.matched} matched, #{result.queued} queued")
    Rails.logger.warn("Tunnel media sync skipped unrecognized files: #{result.skipped_filenames.join(", ")}") if result.skipped_filenames.any?
  end
end
