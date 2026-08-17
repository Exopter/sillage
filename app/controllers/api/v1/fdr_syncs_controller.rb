module Api
  module V1
    class FdrSyncsController < ApplicationController
      protect_from_forgery with: :exception

      def create
        result = FdrSync::Ingest.new(
          user: Current.user,
          upload: params.require(:source_file),
          metadata: sync_params
        ).call
        render json: payload(result), status: result.duplicate || result.ignored ? :ok : :created
      rescue FdrSync::Error, ExoFdr::Error, ActiveRecord::RecordInvalid,
             ActiveStorage::Error, ActionController::ParameterMissing => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      private

      def sync_params
        params.permit(
          :device_id,
          :filename,
          :file_index,
          :boot_id,
          :format_version,
          :size_bytes,
          :sha256
        )
      end

      def payload(result)
        if result.ignored
          return {
            duplicate: false,
            ignored: true,
            duration_seconds: result.duration_seconds,
            sha256: result.sha256
          }
        end

        flight_import = result.flight_import
        {
          duplicate: result.duplicate,
          ignored: false,
          import_id: flight_import.id,
          import_status: flight_import.status,
          sha256: result.sha256,
          url: flight_import_path(flight_import)
        }
      end
    end
  end
end
