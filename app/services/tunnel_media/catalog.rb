require "tempfile"

module TunnelMedia
  # Reconcile already discovered camera files without contacting the portal.
  class Catalog
    FLIGHT_MARGIN = 1.hour

    def initialize(configuration:, matcher: Matcher.new)
      @configuration = configuration
      @matcher = matcher
    end

    def call(range)
      pending = TunnelVideo.unmatched.where(recorded_at: range).where.not(status: "ignored")
      first, last = pending.pick(Arel.sql("MIN(recorded_at)"), Arel.sql("MAX(recorded_at)"))
      return 0 unless first
      scope = TunnelVideo.where(recorded_at: (first - FLIGHT_MARGIN)..(last + FLIGHT_MARGIN)).order(:id)

      # Only debrief-only candidates need the end of the source movie. Read one
      # angle before locking the catalog, then recompute against current rows.
      probes = []
      matches(scope.to_a) do |take|
        probes << (take.files.find { |file| file.camera == "Side" } || take.files.first)
        nil
      end
      probes.uniq.each { |file| measure(file) if range.cover?(file.recorded_at) }

      # Lock in a stable order so concurrent syncs cannot split a camera group.
      TunnelVideo.transaction do
        matches(scope.lock.to_a).sum do |match|
          files = match.clip.files.select { |file| file.flight_id.nil? && range.cover?(file.recorded_at) }
          next 0 if files.empty?
          TunnelVideo.where(id: files.map(&:id), flight_id: nil).where.not(status: "ignored")
            .update_all(flight_id: match.flight.id, match_method: match.method, updated_at: Time.current)
        end
      end
    end

    Take = Struct.new(:files) do
      def self.key(file)
        return [ file.timeslot_at, file.clip_number ] if file.timeslot_at && file.clip_number

        [ file.timeslot_at, file.recorded_at ]
      end

      def recorded_at = files.first.recorded_at
      def timeslot_at = files.first.timeslot_at
    end

    def matches(rows, &missing_duration)
      return [] if rows.empty?
      first, last = rows.map(&:recorded_at).minmax
      flights = Sync.eligible_flights(@configuration).where(started_at: ..(last + FLIGHT_MARGIN), ended_at: (first - FLIGHT_MARGIN)..).index_by(&:id)
      debriefs = FlightDebrief.where(flight_id: flights.keys)
      audio = ActiveStorage::Attachment.where(record_type: "FlightDebrief", name: "audio").select(:record_id)
      debriefed = debriefs.where.not(flight_comment_id: nil).or(debriefs.where.not(transcript: [ nil, "" ])).or(debriefs.where(id: audio))
        .distinct.pluck(:flight_id).map { |id| flights.fetch(id) }.to_set
      assigned = {}
      available = []
      blocked = []
      durations = {}
      inherited = []
      rows.group_by { |row| Take.key(row) }.each_value do |group|
        take = Take.new(group.sort_by(&:recorded_at))
        owners = group.filter_map(&:flight_id).uniq
        if group.any? { |file| file.status == "ignored" } || owners.many? || (owners.any? && !flights.key?(owners.first))
          blocked << take
          next
        end
        durations[take] = group.filter_map(&:duration_seconds).max
        if owners.empty?
          available << take
        else
          existing = group.find(&:flight_id)
          assigned[take] = flights.fetch(existing.flight_id)
          inherited << Matcher::Match.new(clip: take, flight: assigned[take], method: existing.match_method) if group.any? { |file| !file.flight_id }
        end
      end
      inherited + @matcher.call(available, flights.values, assigned:, debriefed:, durations:, blocked:, &missing_duration)
    end

    private

    def measure(file)
      Tempfile.create([ "tunnel-duration-", ".mp4" ], binmode: true) do |io|
        Client.download(file.source_url, io)
        io.flush
        duration = Videos::MediaTools.new.probe_duration(io.path)
        TunnelVideo.where(id: file.id, flight_id: nil, duration_seconds: nil, status: "pending").update_all(duration_seconds: duration) if duration
      end
    rescue Client::Error, Videos::MediaTools::Error => error
      Rails.logger.warn("Tunnel camera duration unavailable for media #{file.id}: #{error.class}")
    end
  end
end
