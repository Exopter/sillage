module Api
  module V1
    class FdrFlightCommandsController < ApplicationController
      OPERATIONS = %w[power signal start stop].freeze

      def create
        recorder = EmbeddedController.find_by!(device_id: FdrIdentity::DeviceId.normalize(params.require(:device_id)))
        op = OPERATIONS.index(params.require(:operation))
        boot, revision = %i[boot_id revision].map { |name| Integer(params.require(name).to_s, 10, exception: false) }
        unless op && [ boot, revision ].all? { |n| n&.between?(1, 0xffffffff) }
          return render json: { error: "Invalid recorder command." }, status: :unprocessable_entity
        end
        flight = 0
        if op >= 2
          session = SignalSession.accessible_to(Current.user).where(status: %w[live syncing]).find_by!(uuid: params.require(:session_uuid))
          unless cookies.signed[SignalController::STATION_COOKIE] == session.uuid
            return head :forbidden
          end
          Signal::RecorderAccess.for_session!(session, device_id: recorder.device_id)
          origin = session.station_metadata["start_boot_id"]
          return head :conflict if op == 2 && origin && boot != origin
          flight = session.flight_id
          return head :unprocessable_entity unless flight&.between?(1, 0xffffffff)
        elsif SignalSession.where(status: %w[live syncing]).where("station_metadata ->> 'recorder_device_id' = ?", recorder.device_id).exists?
          return render json: { error: "End the active flight before changing its trigger." }, status: :conflict
        end
        key = recorder.fdr_auth_key
        return head :conflict unless recorder.initialized? && key&.bytesize == EmbeddedController::FDR_AUTH_KEY_BYTES

        message = [ op, boot, revision, flight ].pack("CV3")
        proof = OpenSSL::HMAC.digest("SHA256", key, FdrModeCommandsController::DOMAIN + message)
        response.headers["Cache-Control"] = "no-store"
        payload = (message + proof).unpack1("H*")
        if params[:transport] == "wifi"
          return head :unprocessable_entity unless op == 2 && origin == boot
          FdrLiveTelemetry.queue_start(recorder, session, payload)
        end
        render json: { payload: payload }
      rescue Signal::RecorderAccess::Denied
        head :forbidden
      rescue ActiveRecord::RecordNotFound
        head :not_found
      rescue EmbeddedController::AuthenticationKeyError
        head :conflict
      end
    end
  end
end
