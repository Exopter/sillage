module TunnelMedia
  # Runtime settings of the tunnel media portal; the feature stays inert until they are present.
  Configuration = Struct.new(:url, :login, :password, :time_zone, :location, :cameras, keyword_init: true) do
    def self.from_env(env = ENV)
      new(
        url: env["TUNNEL_MEDIA_URL"].presence,
        login: env["TUNNEL_MEDIA_LOGIN"].presence,
        password: env["TUNNEL_MEDIA_PASSWORD"].presence,
        time_zone: env["TUNNEL_MEDIA_TIME_ZONE"].presence || "Europe/Ljubljana",
        location: env["TUNNEL_MEDIA_LOCATION"].presence,
        cameras: (env["TUNNEL_MEDIA_CAMERAS"].presence || "Side,Top").split(",").map { |camera| camera.strip.capitalize }.reject(&:empty?)
      )
    end

    def configured?
      url.present? && login.present? && password.present? && location.present?
    end

    def zone
      ActiveSupport::TimeZone[time_zone] || raise(ArgumentError, "Unknown TUNNEL_MEDIA_TIME_ZONE #{time_zone}")
    end
  end
end
