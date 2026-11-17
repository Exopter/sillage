require "net/http"

module TunnelMedia
  # Signed-in HTTP session on the tunnel media portal. Filters are server-side
  # session state, so one client reads the timeslots sequentially.
  class Client
    class Error < StandardError; end

    USER_AGENT = "Sillage tunnel media sync".freeze
    MAX_REDIRECTS = 5

    def initialize(configuration, pause_seconds: 1.0)
      @configuration = configuration
      @base = URI(configuration.url)
      @pause_seconds = pause_seconds
      @cookies = {}
    end

    def sign_in
      body = request(:post, @base, form: { ctrl: "do", do: "login", goto: @base.path.delete_prefix("/"),
        login: @configuration.login, password: @configuration.password })
      listing = parse(body)
      raise Error, "The tunnel media portal rejected the sign-in" unless listing.signed_in?

      listing
    end

    def timeslot(epoch)
      pause
      listing = parse(request(:get, @base + "index.php?ctrl=do&do=set_filter&namespace=proflyer&filter_name=timeslot&filter_value=#{Integer(epoch)}"))
      raise Error, "The tunnel media portal session expired" unless listing.signed_in?

      listing
    end

    # Streams a media file; the token in the URL is the only credential it needs.
    def self.download(url, io, limit: MAX_REDIRECTS)
      uri = URI(url)
      raise Error, "Unsupported media URL" unless uri.is_a?(URI::HTTPS)

      Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 15, read_timeout: 120) do |http|
        http.request(Net::HTTP::Get.new(uri, "User-Agent" => USER_AGENT)) do |response|
          case response
          when Net::HTTPRedirection
            raise Error, "Too many redirects while downloading tunnel media" if limit.zero?

            return download(URI.join(url, response["location"]).to_s, io, limit: limit - 1)
          when Net::HTTPSuccess
            response.read_body { |chunk| io.write(chunk) }
          else
            raise Error, "Tunnel media download failed with HTTP #{response.code}"
          end
        end
      end
      io
    rescue SocketError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError => error
      raise Error, "Tunnel media download failed: #{error.class}"
    end

    private

    def parse(body)
      Listing.new(body, zone: @configuration.zone)
    end

    def pause
      sleep(@pause_seconds) if @pause_seconds.positive?
    end

    def request(method, uri, form: nil, limit: MAX_REDIRECTS)
      raise Error, "Unsupported portal URL" unless uri.is_a?(URI::HTTPS) && uri.host == @base.host

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 15, read_timeout: 60) do |http|
        message = method == :post ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
        message["User-Agent"] = USER_AGENT
        message["Cookie"] = @cookies.map { |name, value| "#{name}=#{value}" }.join("; ") if @cookies.any?
        message.set_form_data(form) if form
        http.request(message)
      end
      store_cookies(response)
      case response
      when Net::HTTPRedirection
        raise Error, "Too many redirects on the tunnel media portal" if limit.zero?

        request(:get, URI.join(uri.to_s, response["location"]), limit: limit - 1)
      when Net::HTTPSuccess
        response.body.to_s.force_encoding(Encoding::UTF_8).scrub
      else
        raise Error, "Tunnel media portal answered HTTP #{response.code}"
      end
    rescue SocketError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError => error
      raise Error, "Tunnel media portal is unreachable: #{error.class}"
    end

    def store_cookies(response)
      Array(response.get_fields("set-cookie")).each do |cookie|
        name, value = cookie.split(";", 2).first.split("=", 2)
        @cookies[name.strip] = value.to_s.strip if name.present?
      end
    end
  end
end
