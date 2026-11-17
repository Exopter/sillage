module TunnelMedia
  # Parses one media portal listing page.
  class Listing
    FILENAME = /\A#(?<number>\d+)_(?<date>\d{8})_(?<time>\d{6})_(?<camera>[A-Za-z0-9]+)\.mp4\z/i
    TIMESLOT = /filter_name=timeslot&filter_value=(\d+)/

    Clip = Struct.new(:media_token, :filename, :source_url, :camera, :clip_number, :recorded_at, keyword_init: true)

    attr_reader :clips, :timeslots, :skipped_filenames

    def initialize(html, zone:)
      document = Nokogiri::HTML(html)
      @signed_in = document.at_css("input[name='password']").nil?
      @timeslots = document.css("a[href*='filter_name=timeslot']").filter_map { |link| link["href"][TIMESLOT, 1]&.to_i }.uniq
      @skipped_filenames = []
      links = document.css("a[href*='media_token=']").index_by { |link| link["href"][/media_token=([0-9a-f]+)/, 1] }
      @clips = document.css("input.media-select[data-token]").filter_map do |input|
        build_clip(input["data-token"], input["data-filename"].to_s, links[input["data-token"]]&.[]("href"), zone)
      end
    end

    def signed_in?
      @signed_in
    end

    private

    def build_clip(token, filename, source_url, zone)
      match = FILENAME.match(filename)
      recorded_at = match && parse_time(zone, match[:date], match[:time])
      unless match && recorded_at && source_url.present?
        @skipped_filenames << filename
        return
      end

      Clip.new(media_token: token, filename:, source_url:, camera: match[:camera].capitalize,
        clip_number: match[:number].to_i, recorded_at:)
    end

    def parse_time(zone, date, time)
      zone.strptime("#{date}#{time}", "%Y%m%d%H%M%S").utc
    rescue ArgumentError
      nil
    end
  end
end
