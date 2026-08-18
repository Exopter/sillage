require "openssl"

module Api
  module V1
    class FdrAuthenticationsController < ApplicationController
      SESSION_DOMAINS = {
        "ble" => "exopter/fdr/ble-session/v1\0".b,
        "usb" => "exopter/fdr/usb-session/v1\0".b
      }.freeze
      NONCE_BYTES = 16

      def create
        recorder = EmbeddedDevice.find_by!(device_id: normalized_device_id)
        key = recorder.fdr_auth_key
        return render json: {
          error: "Connect this recorder over USB-C once to establish its Sillage authentication key."
        }, status: :conflict unless key&.bytesize == EmbeddedDevice::FDR_AUTH_KEY_BYTES

        nonce_hex = params.require(:nonce).to_s
        valid_nonce = nonce_hex.match?(/\A[0-9a-f]{#{NONCE_BYTES * 2}}\z/i) && !nonce_hex.match?(/\A0+\z/)
        return render json: { error: "The recorder authentication challenge is invalid." },
          status: :unprocessable_entity unless valid_nonce
        nonce = [ nonce_hex ].pack("H*")
        domain = SESSION_DOMAINS[params.require(:transport).to_s]
        return render json: { error: "The recorder authentication transport is invalid." },
          status: :unprocessable_entity unless domain

        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
        render json: {
          proof: OpenSSL::HMAC.hexdigest("SHA256", key, domain + nonce)
        }
      rescue EmbeddedDevice::AuthenticationKeyError
        render json: { error: "The recorder authentication key is unavailable." },
          status: :unprocessable_entity
      rescue ActiveRecord::RecordNotFound
        render json: { error: "This recorder is not registered in Forge." }, status: :not_found
      end

      private

      def normalized_device_id
        value = params.require(:device_id)
        raise ActiveRecord::RecordNotFound unless FdrIdentity::DeviceId.valid?(value)

        FdrIdentity::DeviceId.normalize(value)
      end
    end
  end
end
