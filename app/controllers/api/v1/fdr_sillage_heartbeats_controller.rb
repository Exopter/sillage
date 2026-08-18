require "openssl"

module Api
  module V1
    class FdrSillageHeartbeatsController < ApplicationController
      HEARTBEAT_FRESHNESS = 15.seconds
      SIGNATURE_CLOCK_SKEW = 60.seconds
      MAX_BODY_BYTES = 4096
      SIGNATURE_DOMAIN = "exopter/fdr/sillage-heartbeat/v1\0".b
      STATUS_KEYS = %w[
        version device_id firmware model sent_at uptime_ms state_flags
        sensor_validity alert_flags storage_free_mib storage_total_mib
        last_sync_result active_file_index last_synced_file_index diagnostics
      ].freeze

      allow_unauthenticated_access only: :create
      skip_forgery_protection only: :create

      def index
        recorders = Assembly
          .where(last_sillage_seen_at: HEARTBEAT_FRESHNESS.ago..)
          .includes(installations: :aircraft)
          .order(last_sillage_seen_at: :desc, device_id: :asc)
        response.headers["Cache-Control"] = "no-store, max-age=0"
        render json: { heartbeats: recorders.map { |recorder| heartbeat_payload(recorder) } }
      end

      def create
        raw_body = request.raw_post
        return head :payload_too_large if raw_body.bytesize > MAX_BODY_BYTES

        payload = JSON.parse(raw_body)
        recorder = Assembly.find_by(device_id: normalize_device_id(payload.fetch("device_id")))
        return head :unauthorized unless recorder
        return head :unauthorized unless valid_signature?(recorder, raw_body)
        return head :unprocessable_entity unless valid_timestamp?(payload["sent_at"])
        return head :unprocessable_entity unless payload["version"] == 1

        seen_at = Time.current
        status = payload.slice(*STATUS_KEYS)
        recorder.update!(
          last_sillage_seen_at: seen_at,
          last_sillage_status: status,
          last_seen_at: seen_at,
          last_seen_firmware: payload["firmware"].to_s.first(128),
          device_model: payload["model"].to_s.first(128)
        )
        head :accepted
      rescue JSON::ParserError, KeyError, Assembly::AuthenticationKeyError
        head :unauthorized
      rescue ActiveRecord::RecordInvalid
        head :unprocessable_entity
      end

      private

      def heartbeat_payload(recorder)
        installation = recorder.installations.select(&:active?).max_by(&:installed_at)
        aircraft = installation&.aircraft

        {
          seen_at: recorder.last_sillage_seen_at.iso8601(3),
          recorder: {
            device_id: recorder.device_id,
            model: recorder.device_model,
            firmware: recorder.last_seen_firmware
          },
          aircraft: aircraft && {
            registration: aircraft.registration
          },
          status: recorder.last_sillage_status
        }
      end

      def normalize_device_id(value)
        raise KeyError unless FdrIdentity::DeviceId.valid?(value)

        FdrIdentity::DeviceId.normalize(value)
      end

      def valid_signature?(recorder, body)
        received = request.headers["X-FDR-Signature"].to_s.downcase
        return false unless received.match?(/\A[0-9a-f]{64}\z/)

        key = recorder.fdr_auth_key
        return false unless key&.bytesize == Assembly::FDR_AUTH_KEY_BYTES

        expected = OpenSSL::HMAC.hexdigest("SHA256", key, SIGNATURE_DOMAIN + body)
        ActiveSupport::SecurityUtils.secure_compare(received, expected)
      end

      def valid_timestamp?(value)
        sent_at = Time.at(Integer(value), in: "UTC")
        (Time.current - sent_at).abs <= SIGNATURE_CLOCK_SKEW
      rescue ArgumentError, TypeError
        false
      end
    end
  end
end
