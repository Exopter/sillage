module Api
  module App
    module V1
      # Exopter mobile app API: JSON only, authenticated with a bearer app token.
      class BaseController < ActionController::API
        include ActionController::HttpAuthentication::Token::ControllerMethods

        before_action :authenticate_app_token
        after_action :prevent_response_caching

        rescue_from ActionController::ParameterMissing do |error|
          render_error :bad_request, "missing_parameter", "#{error.param} is required."
        end

        private

        attr_reader :current_app_token

        def current_user
          current_app_token&.user
        end

        def authenticate_app_token
          @current_app_token = authenticate_with_http_token { |token, _options| AppToken.authenticate(token) }
          render_error :unauthorized, "unauthorized", "Sign in again." unless current_app_token
        end

        def render_error(status, code, message, **extra)
          render json: { error: code, message: message, **extra }, status: status
        end

        def account_payload(user)
          {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email_address
          }
        end

        def recorder_payload(ownership)
          {
            id: ownership.id,
            device_id: ownership.embedded_controller.device_id,
            name: ownership.name,
            model: "lite",
            last_seen_at: ownership.last_seen_at&.iso8601,
            last_flight_at: ownership.last_flight_at&.iso8601
          }
        end

        def prevent_response_caching
          response.headers["Cache-Control"] = "no-store"
        end
      end
    end
  end
end
