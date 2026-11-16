require "openssl"

module Api
  module V1
    # Signs the mode command a ground station sends to a distributed Seat over
    # the radio. The radio link is not encrypted: the module acts only on a
    # proof made with its own Sillage key and bound to its current boot.
    class FdrModeCommandsController < ApplicationController
      DOMAIN = "exopter/fdr/radio-mode/v1\0".b
      MODES = { "flight" => 0, "ground" => 1 }.freeze

      def create
        recorder = EmbeddedController.find_by!(device_id: normalized_device_id)
        mode = MODES[params.require(:mode).to_s]
        boot_id = Integer(params.require(:boot_id).to_s, 10, exception: false)
        unless mode && boot_id&.between?(1, 0xffffffff)
          return render json: { error: "The mode or the boot identifier is invalid." }, status: :unprocessable_entity
        end
        key = recorder.fdr_auth_key
        unless recorder.initialized? && key&.bytesize == EmbeddedController::FDR_AUTH_KEY_BYTES
          return render json: {
            error: "Initialize this module over USB-C in Forge first: it accepts a mode change only with its Sillage key."
          }, status: :conflict
        end

        message = [ mode, boot_id ].pack("CV")
        recorder.record_activity!("mode_requested", source: "signal", actor: Current.user,
          details: { mode: params[:mode].to_s, boot_id:, transport: "ground-radio" })
        response.headers["Cache-Control"] = "no-store, max-age=0"
        render json: { payload: (message + OpenSSL::HMAC.digest("SHA256", key, DOMAIN + message)).unpack1("H*") }
      rescue EmbeddedController::AuthenticationKeyError
        render json: { error: "The module authentication key is unavailable." }, status: :unprocessable_entity
      rescue ActiveRecord::RecordNotFound
        render json: { error: "This module is not registered in Forge." }, status: :not_found
      rescue ActionController::ParameterMissing => error
        render json: { error: error.message }, status: :unprocessable_entity
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
