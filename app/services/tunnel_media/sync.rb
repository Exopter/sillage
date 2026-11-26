module TunnelMedia
  # Discovers portal clips, associates them with flights and queues downloads.
  class Sync
    Result = Struct.new(:discovered, :matched, :queued, :skipped_filenames, keyword_init: true)

    RESCAN_WINDOW = 2.days
    MATCH_WINDOW = 30.days
    AWAITING_WINDOW = 3.days

    # Only tunnel flights at the portal's site receive clips.
    def self.eligible_flights(configuration)
      Flight.where(environment: "tunnel", location: configuration.location)
    end

    # True while a recent eligible flight still has no clip, so idle periods never reach the portal.
    def self.awaiting_clips?(configuration, now: Time.current)
      eligible_flights(configuration).where(started_at: (now - AWAITING_WINDOW)..).where.missing(:tunnel_videos).exists?
    end

    def initialize(configuration: Configuration.from_env, client: nil, matcher: Matcher.new, now: Time.current)
      @configuration = configuration
      @client = client || Client.new(configuration)
      @matcher = matcher
      @now = now
    end

    def call
      discovered, skipped = discover
      result = reconcile
      result.discovered = discovered
      result.skipped_filenames = skipped
      result
    rescue Client::Error
      reconcile
      raise
    end

    def reconcile(range = nil)
      matched = Catalog.new(configuration: @configuration, matcher: @matcher).call(range || ((@now - MATCH_WINDOW)..@now))
      Result.new(discovered: 0, matched:, queued: queue_downloads(range), skipped_filenames: [])
    end

    private

    def discover
      discovered = 0
      skipped = []
      pending = @client.sign_in.timeslots
      seen = []
      while (epoch = pending.shift)
        seen << epoch
        next unless scan?(epoch)

        listing = @client.timeslot(epoch)
        pending.concat(listing.timeslots - seen - pending)
        skipped.concat(listing.skipped_filenames)
        discovered += store(listing.clips, Time.zone.at(epoch))
      end
      [ discovered, skipped.uniq ]
    end

    # Recent timeslots can still receive clips; older ones are read once.
    def scan?(epoch)
      timeslot_at = Time.zone.at(epoch)
      timeslot_at >= @now - RESCAN_WINDOW || !TunnelVideo.exists?(timeslot_at:)
    end

    def store(clips, timeslot_at)
      return 0 if clips.empty?

      rows = clips.map { |clip| clip.to_h.merge(timeslot_at:, created_at: @now, updated_at: @now) }
      TunnelVideo.insert_all(rows, unique_by: :media_token).length
    end

    def queue_downloads(range)
      # Every camera is catalogued; only the configured ones are stored.
      pending = TunnelVideo.where(status: "pending", camera: @configuration.cameras).where.not(flight_id: nil)
      pending = pending.where(recorded_at: range) if range
      pending.count do |video|
        TunnelVideoDownloadJob.perform_later(video)
      end
    end
  end
end
