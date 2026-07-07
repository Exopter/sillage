require "rqrcode"

module TwoFactor
  class SetupsController < ApplicationController
    layout "authentication"
    allow_unverified_two_factor_access

    before_action :ensure_admin_requires_setup

    def new
      @totp_secret = pending_totp_secret
      @qr_svg = RQRCode::QRCode.new(Current.user.provisioning_uri(@totp_secret)).as_svg(
        color: "000",
        shape_rendering: "crispEdges",
        module_size: 4,
        standalone: true,
        use_path: true
      )
    end

    def create
      secret = pending_totp_secret

      if Current.user.verify_totp(params[:otp_code], secret:)
        Current.user.enable_totp!(secret)
        Current.user.record_totp_verification!
        Current.session.verify_otp!
        session.delete(:pending_totp_secret)
        redirect_to after_two_factor_url, notice: "Two-factor authentication is enabled."
      else
        redirect_to new_two_factor_setup_path, alert: "Invalid authentication code."
      end
    end

    private

    def ensure_admin_requires_setup
      redirect_to root_path unless Current.user&.totp_required?
      redirect_to new_two_factor_challenge_path if Current.user&.totp_configured?
    end

    def pending_totp_secret
      session[:pending_totp_secret] ||= ROTP::Base32.random_base32
    end
  end
end
