require "openssl"

module Api
  module V1
    class FdrSillageHeartbeatsController < ApplicationController
      HEARTBEAT_FRESHNESS = SignalPresence::FRESHNESS
      SIGNATURE_CLOCK_SKEW = 60.seconds
      MAX_BODY_BYTES = 4096
      SIGNATURE_DOMAIN = "exopter/fdr/sillage-heartbeat/v1\0".b
      COMMAND_SIGNATURE_DOMAIN = "exopter/fdr/sillage-command/v1\0".b
      STATUS_KEYS = %w[
        version device_id firmware model sent_at uptime_ms state_flags
        sensor_validity alert_flags storage_free_mib storage_total_mib
        last_sync_result active_file_index last_synced_file_index diagnostics
        wifi_upload recording_control
      ].freeze

      allow_unauthenticated_access only: :create
      skip_forgery_protection only: :create

      def index
        presences = SignalPresence
          .fresh(HEARTBEAT_FRESHNESS.ago)
          .includes(embedded_device: { assembly: { installations: :aircraft } })
          .recent
        response.headers["Cache-Control"] = "no-store, max-age=0"
        render json: { heartbeats: presences.map { |presence| heartbeat_payload(presence) } }
      end

      def create
        raw_body = request.raw_post
        return head :payload_too_large if raw_body.bytesize > MAX_BODY_BYTES

        payload = JSON.parse(raw_body)
        recorder = EmbeddedDevice.find_by(device_id: normalize_device_id(payload.fetch("device_id")))
        return head :unauthorized unless recorder
        return head :unauthorized unless valid_signature?(recorder, raw_body)
        return head :unprocessable_entity unless valid_timestamp?(payload["sent_at"])
        return head :unprocessable_entity unless payload["version"] == 1
        return head :unprocessable_entity unless valid_recording_control?(payload["recording_control"])

        seen_at = Time.current
        status = payload.slice(*STATUS_KEYS)
        recorder.update!(
          last_identified_at: seen_at,
          last_seen_firmware: payload["firmware"].to_s.first(128),
          device_model: payload["model"].to_s.first(128)
        )
        presence = recorder.signal_presence || recorder.build_signal_presence
        presence.update!(last_seen_at: seen_at, status:)
        reconcile_recording_command(recorder, payload["recording_control"], seen_at)
        attach_recording_command(recorder) if payload["recording_control"].is_a?(Hash)
        head :accepted
      rescue JSON::ParserError, KeyError, EmbeddedDevice::AuthenticationKeyError
        head :unauthorized
      rescue ActiveRecord::RecordInvalid
        head :unprocessable_entity
      end

      private

      def heartbeat_payload(presence)
        recorder = presence.embedded_device
        installation = recorder.active_installation
        aircraft = installation&.aircraft

        {
          seen_at: presence.last_seen_at.iso8601(3),
          recorder: {
            device_id: recorder.device_id,
            model: recorder.device_model,
            firmware: recorder.last_seen_firmware
          },
          aircraft: aircraft && {
            registration: aircraft.registration
          },
          status: presence.status,
          recording_command: recording_command_payload(
            recorder.fdr_recording_commands.recent.first
          )
        }
      end

      def valid_recording_control?(control)
        return true if control.nil?
        return false unless control.is_a?(Hash)

        sequence = Integer(control["last_command_sequence"], exception: false)
        result = Integer(control["last_command_result"], exception: false)
        [ true, false ].include?(control["requested_enabled"])
          && [ true, false ].include?(control["effective_enabled"])
          && sequence && sequence >= 0
          && result && result.between?(0, 3)
      end

      def reconcile_recording_command(recorder, control, seen_at)
        return unless control.is_a?(Hash)

        sequence = Integer(control["last_command_sequence"], exception: false)
        result = Integer(control["last_command_result"], exception: false)
        return unless sequence&.positive? && result

        command = recorder.fdr_recording_commands.find_by(id: sequence)
        command&.acknowledge!(result:, at: seen_at) if command&.status == "pending"
      end

      def attach_recording_command(recorder)
        command = recorder.fdr_recording_commands.pending.recent.first
        return unless command

        canonical = [ command.id, command.requested_enabled ? 1 : 0 ].pack("Q<C")
        signature = OpenSSL::HMAC.hexdigest(
          "SHA256",
          recorder.fdr_auth_key,
          COMMAND_SIGNATURE_DOMAIN + canonical
        )
        response.headers["X-FDR-Command-Sequence"] = command.id.to_s
        response.headers["X-FDR-Recording-Enabled"] = command.requested_enabled ? "1" : "0"
        response.headers["X-FDR-Command-Signature"] = signature
      end

      def recording_command_payload(command)
        return unless command

        {
          sequence: command.id,
          requested_enabled: command.requested_enabled,
          status: command.status,
          result: command.result,
          acknowledged_at: command.acknowledged_at&.iso8601(3)
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
        return false unless key&.bytesize == EmbeddedDevice::FDR_AUTH_KEY_BYTES

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
