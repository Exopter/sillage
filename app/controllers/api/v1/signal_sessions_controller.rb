module Api
  module V1
    class SignalSessionsController < ApplicationController
      protect_from_forgery with: :exception
      before_action :set_signal_session, only: %i[batches events complete]

      def create
        signal_session = Current.user.signal_sessions.find_by(uuid: create_params[:uuid])
        signal_session ||= create_signal_session!
        render json: session_payload(signal_session), status: :created
      end

      def batches
        batch = Signal::IngestBatch.new(
          signal_session: @signal_session,
          sequence: params.require(:sequence),
          payload: batch_params.to_h
        ).call
        render json: {
          sequence: batch.sequence,
          acknowledged_sequence: @signal_session.reload.last_acknowledged_sequence
        }
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

      def create_signal_session!
        flight = if create_params[:flight_id].present?
          Current.user.flights.find(create_params[:flight_id])
        else
          Current.user.flights.create!(
            name: "Live flight",
            status: "live",
            aircraft: Aircraft.find_by(telemetry_system_id: create_params[:telemetry_system_id]),
            landing_zone: detected_landing_zone,
            started_at: parse_time(create_params[:started_at]) || Time.current
          )
        end
        flight.update!(status: "live", started_at: flight.started_at || Time.current)
        flight.capture_configuration!
        Current.user.signal_sessions.create!(
          uuid: create_params[:uuid],
          flight:,
          started_at: parse_time(create_params[:started_at]) || Time.current,
          station_metadata: create_params[:station_metadata] || {}
        )
      end

      def create_params
        params.permit(:uuid, :flight_id, :telemetry_system_id, :latitude, :longitude, :started_at, station_metadata: {})
      end

      def batch_params
        params.permit(
          :first_received_at,
          :last_received_at,
          :telemetry_system_id,
          position: %i[latitude longitude],
          samples: [
            :kind,
            :sensor_type,
            :recorded_at,
            :elapsed_seconds,
            :latitude,
            :longitude,
            :lat,
            :lon,
            :altitude_m,
            :vel_n_mps,
            :vel_e_mps,
            :vel_d_mps,
            :horizontal_accuracy_m,
            :vertical_accuracy_m,
            :speed_accuracy_mps,
            :heading_deg,
            :course_accuracy_deg,
            :gps_fix,
            :satellite_count,
            :horizontal_speed_mps,
            :vertical_speed_mps,
            :glide_ratio,
            :distance_from_start_m,
            { readings: {} }
          ]
        )
      end

      def detected_landing_zone
        return if create_params[:latitude].blank? || create_params[:longitude].blank?

        LandingZone.detect(latitude: create_params[:latitude], longitude: create_params[:longitude])
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
          acknowledged_sequence: signal_session.last_acknowledged_sequence
        }
      end
    end
  end
end
