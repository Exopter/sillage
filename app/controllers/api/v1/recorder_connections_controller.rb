module Api
  module V1
    class RecorderConnectionsController < ApplicationController
      def index
        response.headers["Cache-Control"] = "no-store, max-age=0"
        render json: { recorders: EmbeddedController.includes(:signal_presence, :recorder_connections).ordered.map(&:connection_snapshot) }
      end

      def update
        observer_id = params.require(:observer_id).to_s
        observations = params[:observations]
        unless observer_id.match?(/\A[0-9a-f-]{36}\z/) && observations.is_a?(Array) && observations.size <= 16 && observations.all? { |item| item.is_a?(ActionController::Parameters) }
          return render json: { error: "Invalid recorder observations." }, status: :unprocessable_entity
        end

        # Serialize snapshots from this operator, including simultaneous tabs. Never register an unknown ECU here.
        Current.user.with_lock do
          scope = RecorderConnection.where(user: Current.user, observer_id:)
          retained = observations.filter_map do |observation|
            transport = observation[:transport].to_s
            age = Integer(observation[:age_ms], exception: false)
            next unless RecorderConnection::TRANSPORTS.include?(transport) && age && age.between?(0, 10_000)

            recorder = EmbeddedController.find_by(device_id: FdrIdentity::DeviceId.normalize(observation[:device_id]))
            next unless recorder

            observed_at = Time.current - age / 1000.0
            connection = scope.find_or_initialize_by(embedded_controller: recorder, transport:)
            connection.update!(last_seen_at: observed_at)
            recorder.with_lock do
              if recorder.last_identified_at.nil? || observed_at > recorder.last_identified_at
                attributes = { last_identified_at: observed_at }
                firmware = observation[:firmware].to_s.strip
                model = observation[:model].to_s.strip
                attributes[:last_seen_firmware] = firmware if firmware.present? && firmware.length <= 128
                attributes[:device_model] = model if model.present? && model.length <= 128
                recorder.update!(attributes)
              end
            end
            connection.id
          end
          scope.where.not(id: retained).delete_all
          RecorderConnection.where(last_seen_at: ...1.day.ago).delete_all
        end
        head :no_content
      end
    end
  end
end
