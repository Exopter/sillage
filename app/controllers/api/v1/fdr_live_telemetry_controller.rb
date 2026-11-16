module Api
  module V1
    class FdrLiveTelemetryController < ApplicationController
      def create
        # A flight in progress, or the standby preview an operator sees before starting one.
        if params[:session_uuid].present?
          session = SignalSession.accessible_to(Current.user).find_by!(uuid: params[:session_uuid])
          return head :conflict unless session.status == "live"
        end

        recorder = EmbeddedController.find_by!(device_id: FdrIdentity::DeviceId.normalize(params.require(:device_id)))
        response.headers["Cache-Control"] = "no-store"
        render json: { telemetry: FdrLiveTelemetry.poll(recorder) }
      end
    end
  end
end
