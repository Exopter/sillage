module Api
  module V1
    class SignalSessionsController < ApplicationController
      protect_from_forgery with: :exception
      before_action :set_signal_session, only: %i[batches events complete shared_state gateway request_stop close_disconnected]

      def create
        signal_session = Signal::StartSession.new(
          user: Current.user,
          device_id: create_params[:device_id],
          flight_id: create_params[:flight_id],
          uuid: create_params[:uuid],
          started_at: parse_time(create_params[:started_at]),
          station_metadata: create_params[:station_metadata] || {},
          mavlink_system_id: create_params[:mavlink_system_id],
          mavlink_component_id: create_params[:mavlink_component_id]
        ).call
        render json: session_payload(signal_session), status: :created
      rescue Signal::StartSession::InvalidFlight, Signal::RecorderAccess::Denied => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def batches
        return unless verify_gateway
        batch = Signal::IngestBatch.new(
          signal_session: @signal_session,
          sequence: params.require(:sequence),
          payload: batch_params.to_h.merge("samples" => params[:samples]&.as_json)
        ).call
        render json: {
          sequence: batch.sequence,
          acknowledged_sequence: @signal_session.reload.last_acknowledged_sequence
        }
      rescue Signal::RecorderAccess::Denied => error
        render json: { error: error.message, code: "recorder_assignment_required" }, status: :unprocessable_entity
      rescue Signal::IngestBatch::InvalidBatch => error
        render json: { error: error.message }, status: :unprocessable_entity
      rescue Signal::IngestBatch::SessionCompleted => error
        render json: { error: error.message }, status: :conflict
      end

      def events
        event = nil
        @signal_session.with_lock do
          if @signal_session.status == "discarded"
            render json: { error: "This Signal session was discarded." }, status: :conflict
            return
          end
          event = @signal_session.operator_events.find_or_initialize_by(uuid: params.require(:event_uuid))
          event.assign_attributes(
            flight: @signal_session.flight,
            event_type: params[:event_type].presence || "marker",
            occurred_at: parse_time(params[:occurred_at]) || Time.current,
            label: params[:label],
            metadata: params[:metadata].presence || {}
          )
          event.save!
          if @signal_session.flight && event.metadata["source"] == "imu_health" && event.metadata["invalidate_preflight_id"].present?
            @signal_session.flight.imu_checks.where(id: event.metadata["invalidate_preflight_id"],
              kind: "preflight", invalidated_at: nil).update_all(
                invalidated_at: event.occurred_at, invalidation_reason: event.label.to_s.first(200))
          end
        end
        SignalSessionChannel.broadcast_to(@signal_session, type: "event", event: event.as_json)
        render json: { uuid: event.uuid }, status: :created
      end

      def complete
        return unless verify_gateway
        Signal::CompleteSession.new(signal_session: @signal_session,
          disposition: params[:disposition],
          name: params[:flight_name], ended_at: parse_time(params[:ended_at]) || Time.current).call
        SignalSessionChannel.broadcast_to(@signal_session, type: "completed", ended_at: @signal_session.ended_at)
        render json: session_payload(@signal_session)
      rescue Signal::CompleteSession::InvalidDecision => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def shared_state
        render json: session_payload(@signal_session).merge(
          gateway_connected: @signal_session.gateway_seen_at && @signal_session.gateway_seen_at > 15.seconds.ago,
          stop_requested: @signal_session.stop_requested_at.present?,
          flight_url: @signal_session.flight && flight_path(@signal_session.flight),
          latest_samples: @signal_session.signal_batches.order(sequence: :desc).first&.payload&.fetch("samples", [])&.last(20) || [])
      end

      def gateway
        token = params.require(:token).to_s
        return head :unprocessable_entity unless token.match?(/\A[0-9a-f-]{36}\z/)
        @signal_session.with_lock do
          digest = Digest::SHA256.hexdigest(token)
          if @signal_session.gateway_token_digest.present? && @signal_session.gateway_token_digest != digest
            return render json: { error: "Another device owns the radio gateway. Reconnect that device." }, status: :conflict
          end
          @signal_session.update!(gateway_token_digest: digest, gateway_seen_at: Time.current)
        end
        shared_state
      end

      def close_disconnected
        @signal_session.with_lock do
          if @signal_session.gateway_seen_at && @signal_session.gateway_seen_at > 15.seconds.ago
            return render json: { error: "The gateway is connected. Request a normal stop." }, status: :conflict
          end
          unless @signal_session.status == "completed"
            @signal_session.update!(stop_requested_at: Time.current,
              station_metadata: @signal_session.station_metadata.merge("closed_without_gateway" => true))
            Signal::CompleteSession.new(signal_session: @signal_session, disposition: "save").call
          end
        end
        shared_state
      end

      def request_stop
        @signal_session.with_lock do
          @signal_session.update!(stop_requested_at: Time.current) unless @signal_session.stop_requested_at || @signal_session.status == "completed"
        end
        shared_state
      end

      private

      def verify_gateway
        digest = @signal_session.gateway_token_digest
        return true if digest.blank? # Existing device clients retain their current ingestion contract.
        return true if ActiveSupport::SecurityUtils.secure_compare(digest, Digest::SHA256.hexdigest(request.headers["X-Signal-Gateway"].to_s))

        render json: { error: "Only the acquisition device can complete or upload this session." }, status: :conflict
        false
      end

      def set_signal_session
        @signal_session = SignalSession.accessible_to(Current.user).find_by!(uuid: params[:uuid])
      end

      def create_params
        params.permit(
          :uuid,
          :device_id,
          :flight_id,
          :mavlink_system_id,
          :mavlink_component_id,
          :started_at,
          station_metadata: {}
        )
      end

      def batch_params
        params.permit(
          :device_id,
          :first_received_at,
          :last_received_at,
          :mavlink_system_id,
          :mavlink_component_id,
          position: %i[latitude longitude]
        )
      end

      def parse_time(value)
        Time.zone.parse(value.to_s) if value.present?
      rescue ArgumentError
        nil
      end

      def session_payload(signal_session)
        {
          uuid: signal_session.uuid,
          flight_id: signal_session.flight_id,
          flight_code: signal_session.flight&.code,
          status: signal_session.status,
          materialization_status: signal_session.materialization_status,
          mavlink_system_id: signal_session.mavlink_system_id,
          mavlink_component_id: signal_session.mavlink_component_id,
          acknowledged_sequence: signal_session.last_acknowledged_sequence
        }
      end
    end
  end
end
