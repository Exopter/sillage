module Api
  module V1
    class FdrAccessRestorationsController < ApplicationController
      before_action :prevent_response_caching
      before_action :require_operator
      before_action :set_recorder

      def create
        unless params[:confirmed] == true && params[:transport] == "usb" && params[:key_configured] == false
          return render_error("Confirm access restoration with this keyless recorder connected over USB-C.", :unprocessable_entity)
        end

        @recorder.with_lock do
          return render_error("Initialize this recorder before requesting access restoration.") unless @recorder.initialized?
          key = @recorder.fdr_auth_key
          return render_error("The existing recorder authentication key is unavailable.") unless key&.bytesize == EmbeddedController::FDR_AUTH_KEY_BYTES

          @recorder.record_activity!("access_restoration_requested", source: "forge", actor: Current.user,
            details: { transport: "usb", device_reported_key_configured: false })
          render json: {
            device_id: @recorder.device_id,
            authentication: { key: Base64.urlsafe_encode64(key, padding: false) },
            restoration_token: verifier.generate(restoration_context, expires_in: 10.minutes)
          }
        end
      rescue EmbeddedController::AuthenticationKeyError
        render_error("The existing recorder authentication key is unavailable.")
      end

      def update
        @recorder.with_lock do
          context = verifier.verified(params[:restoration_token].to_s)
          unless context && context == restoration_context
            return render_error("This access restoration has expired or changed. Reconnect the recorder and try again.")
          end

          @recorder.update!(fdr_auth_key_installed_at: Time.current)
          @recorder.record_activity!("access_restored", source: "forge", actor: Current.user,
            details: { transport: "usb", existing_key_preserved: true })
          render json: { status: "restored", device_id: @recorder.device_id }
        end
      end

      private

      def require_operator
        return if Current.user.active_for_authentication? && User::ROLES.include?(Current.user.role)

        render_error("An active operator account is required to restore recorder access.", :forbidden)
      end

      def set_recorder
        @recorder = EmbeddedController.find(params[:fdr_id])
        value = params.require(:device_id)
        unless FdrIdentity::DeviceId.valid?(value) && @recorder.device_id == FdrIdentity::DeviceId.normalize(value)
          render_error("The connected ECU does not match this recorder. Access restoration was refused.")
        end
      end

      def restoration_context
        {
          "recorder_id" => @recorder.id,
          "device_id" => @recorder.device_id,
          "session_id" => Current.session.id,
          "initialized_at" => @recorder.fdr_auth_key_installed_at&.iso8601(6),
          "key_digest" => Digest::SHA256.hexdigest(@recorder.fdr_auth_key_ciphertext.to_s)
        }
      end

      def verifier
        Rails.application.message_verifier("fdr-access-restoration-v1")
      end

      def render_error(message, status = :conflict)
        render json: { error: message }, status:
      end

      def prevent_response_caching
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
      end
    end
  end
end
