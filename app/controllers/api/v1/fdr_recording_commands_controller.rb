module Api
  module V1
    class FdrRecordingCommandsController < ApplicationController
      def create
        recorder = EmbeddedDevice.find_by!(device_id: normalized_device_id)
        requested_enabled = params.require(:enabled)
        unless [ true, false ].include?(requested_enabled)
          return render json: { error: "Enabled must be a boolean." }, status: :unprocessable_entity
        end
        presence = recorder.signal_presence
        unless recorder.initialized? && presence&.fresh? && presence.status["recording_control"].is_a?(Hash)
          return render json: {
            error: "The recorder is not currently reachable over an authenticated control path."
          }, status: :conflict
        end

        command = recorder.with_lock do
          recorder.fdr_recording_commands.pending.update_all(
            status: "superseded",
            updated_at: Time.current
          )
          recorder.fdr_recording_commands.create!(
            requested_by: Current.user,
            requested_enabled:
          )
        end
        recorder.record_activity!(
          "recording_mode_requested",
          source: "forge",
          actor: Current.user,
          details: {
            command_sequence: command.id,
            requested_enabled: command.requested_enabled,
            transport: "wifi"
          }
        )
        response.headers["Cache-Control"] = "no-store, max-age=0"
        render json: command_payload(command), status: :accepted
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Recorder not found." }, status: :not_found
      rescue ActionController::ParameterMissing => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      private

      def normalized_device_id
        value = params.require(:device_id)
        raise ActiveRecord::RecordNotFound unless FdrIdentity::DeviceId.valid?(value)

        FdrIdentity::DeviceId.normalize(value)
      end

      def command_payload(command)
        {
          sequence: command.id,
          device_id: command.embedded_device.device_id,
          requested_enabled: command.requested_enabled,
          status: command.status
        }
      end
    end
  end
end
