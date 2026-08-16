module Api
  module V1
    class FdrInitializationsController < ApplicationController
      before_action :set_recorder

      def create
        device_id = normalized_device_id
        return render_binding_conflict(device_id) unless @recorder.device_id == device_id
        return render_already_initialized if @recorder.fdr_auth_key_installed_at?

        prevent_response_caching
        render json: {
          version: 1,
          device_id: device_id,
          authentication: { key: @recorder.fdr_auth_key_encoded }
        }
      rescue Assembly::AuthenticationKeyError => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def update
        device_id = normalized_device_id
        return render_binding_conflict(device_id) unless @recorder.device_id == device_id
        return render_missing_key unless @recorder.fdr_auth_key_ciphertext?

        @recorder.update!(fdr_auth_key_installed_at: Time.current)
        prevent_response_caching
        render json: { status: "confirmed", device_id: device_id }
      end

      private

      def set_recorder
        @recorder = Assembly.find(params[:assembly_id])
        head :not_found unless @recorder.flight_data_recorder?
      end

      def normalized_device_id
        params.require(:device_id).to_s.strip.upcase.tap do |device_id|
          raise ActionController::ParameterMissing, :device_id unless device_id.match?(Assembly::DEVICE_ID_PATTERN)
        end
      end

      def render_binding_conflict(device_id)
        render json: {
          error: "This Hangar recorder is bound to #{@recorder.device_id}; refusing to initialize #{device_id}."
        }, status: :conflict
      end

      def render_already_initialized
        render json: {
          error: "This recorder is already initialized. Authenticate it instead of requesting its raw key again."
        }, status: :conflict
      end

      def render_missing_key
        render json: { error: "No Sillage authentication key has been prepared for this recorder." },
          status: :conflict
      end

      def prevent_response_caching
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
      end
    end
  end
end
