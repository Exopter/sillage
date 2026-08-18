module Api
  module V1
    class FdrRegistrationsController < ApplicationController
      def show
        resolution = FdrIdentity::Resolve.new(device_id).call
        response.headers["Cache-Control"] = "no-store, max-age=0"

        if resolution.recorder
          render json: registration_payload(resolution, created: false)
        else
          render json: { registered: false, device_id: device_id }
        end
      end

      def create
        recorder, created = find_or_register_recorder
        update_observed_identity(recorder)
        resolution = FdrIdentity::Resolve.new(recorder.device_id).call

        prevent_response_caching
        render json: registration_payload(resolution, created: created), status: created ? :created : :ok
      rescue ActiveRecord::RecordInvalid => error
        render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end

      private

      def device_id
        value = FdrIdentity::DeviceId.normalize(params.require(:device_id))
        raise ActionController::ParameterMissing, :device_id if value.blank?

        @device_id ||= value
      end

      def observed_identity
        params.permit(:model, :firmware, :mavlink_system_id, :mavlink_component_id)
      end

      def find_or_register_recorder
        recorder = Assembly.find_by(device_id: device_id)
        return [ recorder, false ] if recorder

        [ Assembly.create!(device_id: device_id, name: "Integrated FDR · #{device_id}"), true ]
      rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique
        recorder = Assembly.find_by(device_id: device_id)
        raise unless recorder

        [ recorder, false ]
      end

      def update_observed_identity(recorder)
        recorder.device_model = observed_identity[:model] if observed_identity[:model].present?
        recorder.last_seen_firmware = observed_identity[:firmware] if observed_identity[:firmware].present?
        recorder.last_seen_at = Time.current
        recorder.mavlink_system_id ||= observed_identity[:mavlink_system_id].presence
        recorder.mavlink_component_id ||= observed_identity[:mavlink_component_id].presence
        recorder.save!
      end

      def registration_payload(resolution, created:)
        recorder = resolution.recorder
        installation = resolution.installation
        aircraft = resolution.aircraft

        {
          registered: true,
          created: created,
          recorder: {
            id: recorder.id,
            internal_number: recorder.internal_number,
            name: recorder.name,
            device_id: recorder.device_id,
            model: recorder.device_model,
            firmware: recorder.last_seen_firmware,
            connectivity_url: connectivity_hangar_assembly_path(recorder),
            initialization_url: api_v1_assembly_fdr_initialization_path(recorder),
            initialization_confirmed: recorder.fdr_auth_key_installed_at?
          },
          aircraft: aircraft && {
            id: aircraft.id,
            registration: aircraft.registration,
            name: aircraft.name,
            display_name: aircraft.display_name,
            installed_at: installation.installed_at.iso8601
          }
        }
      end

      def prevent_response_caching
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
      end
    end
  end
end
