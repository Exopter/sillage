namespace :tunnel_media do
  desc "Discover tunnel portal clips, match them to flights and queue their downloads"
  task sync: :environment do
    abort "Set TUNNEL_MEDIA_URL, TUNNEL_MEDIA_LOGIN, TUNNEL_MEDIA_PASSWORD and TUNNEL_MEDIA_LOCATION." unless TunnelMedia::Configuration.from_env.configured?

    result = TunnelMedia::Sync.new.call
    puts "#{result.discovered} clips discovered, #{result.matched} matched, #{result.queued} downloads queued."
    puts "Unrecognized files: #{result.skipped_filenames.join(", ")}" if result.skipped_filenames.any?
  end
end
