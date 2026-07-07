require "digest"

class LandingController < ApplicationController
  layout "landing"
  allow_unauthenticated_access
  before_action :authenticate_landing_access

  def show
    @sillage_os_url = sillage_os_url
  end

  private

  def authenticate_landing_access
    return unless landing_basic_auth_enabled?

    authenticate_or_request_with_http_basic("Exopter") do |username, password|
      secure_digest_compare(username, ENV.fetch("SILLAGE_LANDING_BASIC_AUTH_USERNAME")) &
        secure_digest_compare(password, ENV.fetch("SILLAGE_LANDING_BASIC_AUTH_PASSWORD"))
    end
  end

  def landing_basic_auth_enabled?
    ENV["SILLAGE_LANDING_BASIC_AUTH_USERNAME"].present? &&
      ENV["SILLAGE_LANDING_BASIC_AUTH_PASSWORD"].present?
  end

  def secure_digest_compare(value, expected)
    ActiveSupport::SecurityUtils.fixed_length_secure_compare(
      Digest::SHA256.hexdigest(value.to_s),
      Digest::SHA256.hexdigest(expected.to_s)
    )
  end

  def sillage_os_url
    if local_landing_host?
      port = [ 80, 443 ].include?(request.port) ? "" : ":#{request.port}"
      return "#{request.protocol}localhost#{port}"
    end

    host = ENV.fetch("SILLAGE_OS_HOSTS", "os.exopter.com")
      .split(",")
      .map(&:strip)
      .reject(&:empty?)
      .first || "os.exopter.com"
    protocol = Rails.env.production? ? "https://" : request.protocol

    "#{protocol}#{host}"
  end

  def local_landing_host?
    request.host == "landing.localhost" || request.host == "localhost" || request.host == "127.0.0.1"
  end
end
