module Api
  module V1
    class FdrSyncsController < ApplicationController
      protect_from_forgery with: :exception

      def create
        result = FdrSync::Ingest.new(
          user: Current.user,
          upload: params.require(:source_file),
          metadata: sync_params.to_h
        ).call
        render json: payload(result), status: result.duplicate ? :ok : :created
      rescue FdrSync::Error, ExoFdr::Error, ActiveRecord::RecordInvalid,
             ActiveStorage::Error, ActionController::ParameterMissing => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def show
        flight_import = Current.user.flight_imports.where(import_type: "exofdr").find(params[:id])
        render json: receipt_payload(flight_import)
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
        receipt_payload(result.flight_import).merge(duplicate: result.duplicate)
      end

      def receipt_payload(flight_import)
        {
          ignored: flight_import.details.to_h["ignored"] == true,
          import_id: flight_import.id,
          import_status: flight_import.status,
          error: flight_import.error_message,
          sha256: flight_import.source_sha256,
          status_url: api_v1_fdr_sync_path(flight_import),
          url: flight_import_path(flight_import)
        }
      end
    end
  end
end
