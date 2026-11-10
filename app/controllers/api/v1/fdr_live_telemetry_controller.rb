module Api
  module V1
    class FdrLiveTelemetryController < ApplicationController
      def create
        session = SignalSession.accessible_to(Current.user).find_by!(uuid: params.require(:session_uuid))
        return head :conflict unless session.status == "live"

        recorder = EmbeddedController.find_by!(device_id: FdrIdentity::DeviceId.normalize(params.require(:device_id)))
        response.headers["Cache-Control"] = "no-store"
        render json: { telemetry: FdrLiveTelemetry.poll(recorder) }
      end
    end
  end
end
