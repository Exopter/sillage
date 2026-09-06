module Api
  module V1
    class SignalSessionsController < ApplicationController
      protect_from_forgery with: :exception
      before_action :set_signal_session, only: %i[batches events complete]

      def create
        signal_session = Signal::StartSession.new(
          user: Current.user,
          flight_id: create_params[:flight_id],
          uuid: create_params[:uuid],
          started_at: parse_time(create_params[:started_at]),
          station_metadata: create_params[:station_metadata] || {},
          mavlink_system_id: create_params[:mavlink_system_id],
          mavlink_component_id: create_params[:mavlink_component_id]
        ).call
        render json: session_payload(signal_session), status: :created
      end

      def batches
        batch = Signal::IngestBatch.new(
          signal_session: @signal_session,
          sequence: params.require(:sequence),
          payload: batch_params.to_h.merge("samples" => params[:samples]&.as_json)
        ).call
        render json: {
          sequence: batch.sequence,
          acknowledged_sequence: @signal_session.reload.last_acknowledged_sequence
        }
      rescue Signal::IngestBatch::InvalidBatch => error
        render json: { error: error.message }, status: :unprocessable_entity
      rescue Signal::IngestBatch::SessionCompleted => error
        render json: { error: error.message }, status: :conflict
      end

      def events
        event = @signal_session.operator_events.find_or_initialize_by(uuid: params.require(:event_uuid))
        event.assign_attributes(
          flight: @signal_session.flight,
          event_type: params[:event_type].presence || "marker",
          occurred_at: parse_time(params[:occurred_at]) || Time.current,
          label: params[:label],
          metadata: params[:metadata].presence || {}
        )
        event.save!
        SignalSessionChannel.broadcast_to(@signal_session, type: "event", event: event.as_json)
        render json: { uuid: event.uuid }, status: :created
      end

      def complete
        @signal_session.complete!(ended_at: parse_time(params[:ended_at]) || Time.current)
        SignalSessionChannel.broadcast_to(@signal_session, type: "completed", ended_at: @signal_session.ended_at)
        render json: session_payload(@signal_session)
      end

      private

      def set_signal_session
        @signal_session = Current.user.signal_sessions.find_by!(uuid: params[:uuid])
      end

      def create_params
        params.permit(
          :uuid,
          :flight_id,
          :mavlink_system_id,
          :mavlink_component_id,
          :started_at,
          station_metadata: {}
        )
      end

      def batch_params
        params.permit(
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
          flight_code: signal_session.flight.code,
          status: signal_session.status,
          mavlink_system_id: signal_session.mavlink_system_id,
          mavlink_component_id: signal_session.mavlink_component_id,
          acknowledged_sequence: signal_session.last_acknowledged_sequence
        }
      end
    end
  end
end
