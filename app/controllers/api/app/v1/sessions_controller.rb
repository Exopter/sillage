module Api
  module App
    module V1
      # Password step of the app sign-in. Members get a token at once; accounts with
      # two-factor authentication get a short-lived challenge for the code step.
      class SessionsController < BaseController
        skip_before_action :authenticate_app_token
        rate_limit to: 10, within: 3.minutes, by: -> { request.remote_ip }, with: -> { render_rate_limited }

        def create
          user = User.find_by(email_address: params.require(:email).to_s.strip.downcase)

          unless user&.active_for_authentication? && user.authenticate(params.require(:password).to_s)
            return render_error :unauthorized, "invalid_credentials", "Try another email address or password."
          end

          if user.totp_required? && !user.totp_configured?
            render_error :forbidden, "two_factor_setup_required",
              "Set up two-factor authentication in Sillage first.", setup_url: sillage_url("/two_factor/setup/new")
          elsif user.totp_required?
            render json: { two_factor_required: true, challenge: user.generate_token_for(:app_two_factor) }
          else
            token = AppToken.issue!(user:, device_name: params[:device_name])
            render json: { token: token.token, account: account_payload(user) }, status: :created
          end
        end

        private

        def render_rate_limited
          render_error :too_many_requests, "rate_limited", "Too many attempts. Try again in a few minutes."
        end

        def sillage_url(path)
          host = ENV.fetch("SILLAGE_HOSTS", "sillage.exopter.com").split(",").map(&:strip).reject(&:empty?).first
          "#{request.protocol}#{host}#{path}"
        end
      end
    end
  end
end
