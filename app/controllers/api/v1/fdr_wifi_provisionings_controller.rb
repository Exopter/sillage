module Api
  module V1
    class FdrWifiProvisioningsController < ApplicationController
      before_action :set_assembly
      before_action :ensure_flight_data_recorder

      def create
        device_id = normalized_device_id
        return unless recorder_binding_available?(device_id)

        profiles = owned_profiles.includes(:wifi_credential).ordered
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"

        render json: {
          version: 1,
          assembly_id: @assembly.internal_number,
          profiles: profiles.map { |profile| provisioning_payload(profile) },
          sillage: {
            heartbeat_url: sillage_heartbeat_url
          }
        }

        WifiCredential.where(id: profiles.map(&:wifi_credential_id)).update_all(last_used_at: Time.current)
      rescue WifiCredential::DecryptionError => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def update
        device_id = normalized_device_id
        return unless recorder_binding_available?(device_id)

        provisioned_at = Time.current
        Assembly.transaction do
          @assembly.update!(device_id: device_id)
          owned_profiles.update_all(
            last_provisioned_at: provisioned_at,
            last_provisioned_device_id: device_id
          )
        end

        response.headers["Cache-Control"] = "no-store, max-age=0"
        render json: { status: "confirmed", provisioned_at: provisioned_at.iso8601 }
      rescue ActiveRecord::RecordInvalid => error
        render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end

      private

      def set_assembly
        @assembly = Assembly.find(params[:assembly_id])
      end

      def ensure_flight_data_recorder
        head :not_found unless @assembly.flight_data_recorder?
      end

      def owned_profiles
        @assembly.fdr_wifi_profiles
      end

      def normalized_device_id
        params.require(:device_id).to_s.strip.upcase.tap do |device_id|
          unless device_id.match?(Assembly::DEVICE_ID_PATTERN)
            raise ActionController::ParameterMissing, :device_id
          end
        end
      end

      def recorder_binding_available?(device_id)
        if @assembly.device_id.present? && @assembly.device_id != device_id
          render json: {
            error: "This Hangar assembly is already bound to #{@assembly.device_id}; refusing to configure #{device_id}."
          }, status: :conflict
          return false
        end
        if Assembly.where(device_id: device_id).where.not(id: @assembly.id).exists?
          render json: {
            error: "#{device_id} is already bound to another Hangar assembly."
          }, status: :conflict
          return false
        end

        true
      end

      def provisioning_payload(profile)
        {
          position: profile.position,
          ssid: profile.ssid,
          security: profile.security_code,
          enabled: profile.enabled,
          password: profile.wifi_credential.provisioning_password
        }
      end

      def sillage_heartbeat_url
        configured = ENV["FDR_SILLAGE_HEARTBEAT_URL"].presence
        return configured if configured
        return api_v1_fdr_sillage_heartbeat_url(host: "sillage.exopter.com", protocol: "https") if Rails.env.production?
        return "http://sillage.test/api/v1/fdr-sillage-heartbeat" if Rails.env.test?

        raise WifiCredential::DecryptionError,
          "Set FDR_SILLAGE_HEARTBEAT_URL to a LAN-reachable Sillage URL; 127.0.0.1 points back to the recorder."
      end
    end
  end
end
