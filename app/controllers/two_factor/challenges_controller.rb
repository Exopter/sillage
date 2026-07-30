module TwoFactor
  class ChallengesController < ApplicationController
    layout "authentication"
    allow_unverified_two_factor_access

    before_action :ensure_admin_has_totp

    def new
    end

    def create
      if Current.user.verify_totp(params[:otp_code])
        Current.user.record_totp_verification!
        Current.session.verify_otp!
        redirect_to after_two_factor_url, notice: "Two-factor authentication verified."
      else
        redirect_to new_two_factor_challenge_path, alert: "Invalid authentication code."
      end
    end

    private

    def ensure_admin_has_totp
      redirect_to root_path unless Current.user&.totp_required?
      redirect_to new_two_factor_setup_path unless Current.user&.totp_configured?
    end
  end
end
