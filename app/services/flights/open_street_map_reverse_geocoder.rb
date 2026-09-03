require "json"
require "net/http"
require "uri"

module Flights
  class OpenStreetMapReverseGeocoder
    class Error < StandardError; end

    DEFAULT_ENDPOINT = "https://nominatim.openstreetmap.org/reverse"
    DEFAULT_SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search"
    DEFAULT_USER_AGENT = "Sillage/1.0 (https://sillage.exopter.com)"
    CACHE_DURATION = 30.days
    CACHE_COORDINATE_PRECISION = 3
    MIN_REQUEST_INTERVAL_SECONDS = 1.1
    AERODROME_SEARCH_RADIUS_M = 3_000.0
    EARTH_RADIUS_M = 6_371_000.0

    class << self
      def within_rate_limit
        request_mutex.synchronize do
          now = monotonic_time
          wait = MIN_REQUEST_INTERVAL_SECONDS - (now - last_request_at.to_f)
          sleep(wait) if wait.positive?
          self.last_request_at = monotonic_time
          yield
        end
      end

      private

      attr_accessor :last_request_at

      def request_mutex
        @request_mutex ||= Mutex.new
      end

      def monotonic_time
        Process.clock_gettime(Process::CLOCK_MONOTONIC)
      end
    end

    def initialize(
      endpoint: ENV.fetch("NOMINATIM_URL", DEFAULT_ENDPOINT),
      search_endpoint: ENV.fetch("NOMINATIM_SEARCH_URL", DEFAULT_SEARCH_ENDPOINT),
      user_agent: ENV.fetch("NOMINATIM_USER_AGENT", DEFAULT_USER_AGENT),
      language: ENV.fetch("NOMINATIM_LANGUAGE", "en"),
      cache: Rails.cache,
      rate_limiter: nil
    )
      @endpoint = endpoint.to_s.presence
      @search_endpoint = search_endpoint.to_s.presence
      @user_agent = user_agent.to_s.presence || DEFAULT_USER_AGENT
      @language = language.to_s.presence || "en"
      @cache = cache
      @rate_limiter = rate_limiter || self.class.method(:within_rate_limit)
    end

    def reverse(latitude:, longitude:)
      return unless @endpoint || @search_endpoint
      return unless valid_coordinates?(latitude, longitude)

      @cache.fetch(cache_key(latitude, longitude), expires_in: CACHE_DURATION) do
        fetch_location(latitude.to_f, longitude.to_f)
      end
    end

    private

    def valid_coordinates?(latitude, longitude)
      lat = Float(latitude)
      lon = Float(longitude)
      lat.finite? && lon.finite? && lat.between?(-90, 90) && lon.between?(-180, 180) && !(lat.zero? && lon.zero?)
    rescue ArgumentError, TypeError
      false
    end

    def cache_key(latitude, longitude)
      lat = latitude.to_f.round(CACHE_COORDINATE_PRECISION)
      lon = longitude.to_f.round(CACHE_COORDINATE_PRECISION)
      "flights/location/openstreetmap/v2/#{lat}/#{lon}/#{@language}"
    end

    def fetch_location(latitude, longitude)
      aerodrome = fetch_nearby_aerodrome(latitude, longitude) if @search_endpoint
      return aerodrome if aerodrome
      return unless @endpoint

      @rate_limiter.call { fetch_reverse_location(latitude, longitude) }
    rescue JSON::ParserError => error
      raise Error, "Geocoding returned invalid JSON: #{error.message}"
    rescue Error
      raise
    rescue StandardError => error
      raise Error, "Geocoding failed: #{error.class}"
    end

    def fetch_nearby_aerodrome(latitude, longitude)
      @rate_limiter.call do
        status, body = perform_request(aerodrome_search_uri(latitude, longitude))
        return if status == 404
        ensure_success!(status, operation: "Aerodrome search")

        payload = JSON.parse(body)
        raise Error, "Aerodrome search returned an invalid payload." unless payload.is_a?(Array)

        nearest_aerodrome(payload, latitude, longitude)
      end
    end

    def fetch_reverse_location(latitude, longitude)
      status, body = perform_request(reverse_request_uri(latitude, longitude))
      return if status == 404
      ensure_success!(status, operation: "Reverse geocoding")

      payload = JSON.parse(body)
      return if payload["error"].present?

      location_label(payload)
    end

    def reverse_request_uri(latitude, longitude)
      uri = endpoint_uri(@endpoint, variable: "NOMINATIM_URL")
      uri.query = URI.encode_www_form(
        format: "jsonv2",
        lat: latitude,
        lon: longitude,
        zoom: 18,
        addressdetails: 1,
        namedetails: 1,
        "accept-language": @language
      )
      uri
    end

    def aerodrome_search_uri(latitude, longitude)
      uri = endpoint_uri(@search_endpoint, variable: "NOMINATIM_SEARCH_URL")
      uri.query = URI.encode_www_form(
        format: "jsonv2",
        q: "aerodrome",
        viewbox: search_viewbox(latitude, longitude),
        bounded: 1,
        limit: 10,
        namedetails: 1,
        "accept-language": @language
      )
      uri
    end

    def endpoint_uri(endpoint, variable:)
      uri = URI.parse(endpoint)
      raise Error, "#{variable} must use HTTP or HTTPS." unless uri.is_a?(URI::HTTP)

      uri
    rescue URI::InvalidURIError => error
      raise Error, "#{variable} is invalid: #{error.message}"
    end

    def perform_request(uri)
      request = Net::HTTP::Get.new(uri)
      request["Accept"] = "application/json"
      request["User-Agent"] = @user_agent

      response = Net::HTTP.start(
        uri.host,
        uri.port,
        use_ssl: uri.scheme == "https",
        open_timeout: 2,
        read_timeout: 4
      ) { |http| http.request(request) }
      [ response.code.to_i, response.body.to_s ]
    end

    def ensure_success!(status, operation:)
      raise Error, "#{operation} returned HTTP #{status}." unless status.between?(200, 299)
    end

    def nearest_aerodrome(payload, latitude, longitude)
      payload.filter_map do |candidate|
        next unless candidate["category"] == "aeroway" && candidate["type"].in?(%w[aerodrome airstrip])

        candidate_latitude = finite_float(candidate["lat"])
        candidate_longitude = finite_float(candidate["lon"])
        label = location_label(candidate)
        next unless candidate_latitude && candidate_longitude && label

        distance = distance_m(latitude, longitude, candidate_latitude, candidate_longitude)
        [ distance, label ] if distance <= AERODROME_SEARCH_RADIUS_M
      end.min_by(&:first)&.last
    end

    def search_viewbox(latitude, longitude)
      latitude_delta = AERODROME_SEARCH_RADIUS_M / 111_320.0
      longitude_scale = [ Math.cos(latitude * Math::PI / 180.0).abs, 0.01 ].max
      longitude_delta = AERODROME_SEARCH_RADIUS_M / (111_320.0 * longitude_scale)
      [
        longitude - longitude_delta,
        latitude + latitude_delta,
        longitude + longitude_delta,
        latitude - latitude_delta
      ].join(",")
    end

    def distance_m(latitude, longitude, other_latitude, other_longitude)
      lat1 = latitude * Math::PI / 180.0
      lat2 = other_latitude * Math::PI / 180.0
      delta_latitude = (other_latitude - latitude) * Math::PI / 180.0
      delta_longitude = (other_longitude - longitude) * Math::PI / 180.0
      haversine = Math.sin(delta_latitude / 2)**2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(delta_longitude / 2)**2

      2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    end

    def finite_float(value)
      number = Float(value)
      number if number.finite?
    rescue ArgumentError, TypeError
      nil
    end

    def location_label(payload)
      payload["name"].to_s.strip.presence ||
        payload["namedetails"].to_h["name"].to_s.strip.presence ||
        settlement_label(payload["address"].to_h) ||
        payload["display_name"].to_s.strip.presence
    end

    def settlement_label(address)
      locality = %w[aeroway city town village municipality hamlet].filter_map do |key|
        address[key].to_s.strip.presence
      end.first
      return unless locality

      [ locality, address["state"], address["country"] ].filter_map { |part| part.to_s.strip.presence }.uniq.join(", ")
    end
  end
end
