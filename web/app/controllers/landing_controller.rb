class LandingController < ApplicationController
  layout "landing"

  def show
    @sillage_os_url = sillage_os_url
  end

  private

  def sillage_os_url
    if local_landing_host?
      port = [ 80, 443 ].include?(request.port) ? "" : ":#{request.port}"
      return "#{request.protocol}localhost#{port}"
    end

    host = ENV.fetch("SILLAGE_OS_HOSTS", "os.sillage.wild.eu")
      .split(",")
      .map(&:strip)
      .reject(&:empty?)
      .first || "os.sillage.wild.eu"
    protocol = Rails.env.production? ? "https://" : request.protocol

    "#{protocol}#{host}"
  end

  def local_landing_host?
    request.host == "landing.localhost" || request.host == "localhost" || request.host == "127.0.0.1"
  end
end
