module Api
  module App
    module V1
      # Code step of the app sign-in: exchanges the password challenge and a TOTP code for a token.
      class TwoFactorSessionsController < BaseController
        skip_before_action :authenticate_app_token
        rate_limit to: 10, within: 3.minutes, by: -> { request.remote_ip }, with: -> { render_rate_limited }

        def create
          user = User.find_by_token_for(:app_two_factor, params.require(:challenge))
          unless user&.active_for_authentication?
            return render_error :unauthorized, "challenge_expired", "Sign in again."
          end

          unless user.verify_totp(params.require(:otp_code))
            log_refused_code(user, params[:otp_code].to_s)
            return render_error :unauthorized, "invalid_code", "Invalid authentication code."
          end

          # Also invalidates the challenge, which is bound to the last verification time.
          user.record_totp_verification!
          token = AppToken.issue!(user:, device_name: params[:device_name])
          render json: { token: token.token, account: account_payload(user) }, status: :created
        end

        private

        # Never logs the code: only its shape and which 30-second step it matches within ±10 minutes.
        def log_refused_code(user, code)
          digits = code.delete(" ")
          totp = ROTP::TOTP.new(user.totp_secret.to_s, issuer: "Sillage")
          step = (-20..20).find { |offset| user.totp_secret && totp.at(Time.current + offset * 30) == digits }
          Rails.logger.info("App 2FA refused user=#{user.id} length=#{digits.length} digits_only=#{digits.match?(/\A\d+\z/)} step_offset=#{step.inspect}")
        end

        def render_rate_limited
          render_error :too_many_requests, "rate_limited", "Too many attempts. Try again in a few minutes."
        end
      end
    end
  end
end
