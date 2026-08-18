module Api
  module V1
    class FdrWifiProvisioningsController < ApplicationController
      before_action :set_fdr

      def create
        device_id = normalized_device_id
        return unless recorder_binding_available?(device_id)

        profiles = owned_profiles.includes(:wifi_credential).ordered
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"

        render json: {
          version: 1,
          fdr_id: @fdr.id.to_s,
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
        EmbeddedDevice.transaction do
          @fdr.update!(device_id: device_id)
          owned_profiles.update_all(
            last_provisioned_at: provisioned_at,
            last_provisioned_device_id: device_id
          )
        end
        @fdr.record_activity!(
          "connectivity_provisioned",
          source: "forge",
          actor: Current.user,
          details: { profile_count: owned_profiles.count, device_id: }
        )

        response.headers["Cache-Control"] = "no-store, max-age=0"
        render json: { status: "confirmed", provisioned_at: provisioned_at.iso8601 }
      rescue ActiveRecord::RecordInvalid => error
        render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end

      private

      def set_fdr
        @fdr = EmbeddedDevice.find(params[:fdr_id])
      end

      def owned_profiles
        @fdr.fdr_wifi_profiles
      end

      def normalized_device_id
        value = params.require(:device_id)
        raise ActionController::ParameterMissing, :device_id unless FdrIdentity::DeviceId.valid?(value)

        FdrIdentity::DeviceId.normalize(value)
      end

      def recorder_binding_available?(device_id)
        if @fdr.device_id.present? && @fdr.device_id != device_id
          render json: {
            error: "This Forge FDR is already bound to #{@fdr.device_id}; refusing to configure #{device_id}."
          }, status: :conflict
          return false
        end
        if EmbeddedDevice.where(device_id: device_id).where.not(id: @fdr.id).exists?
          render json: {
            error: "#{device_id} is already bound to another Forge FDR."
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
