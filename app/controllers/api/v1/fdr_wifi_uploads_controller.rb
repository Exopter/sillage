require "json"

module Api
  module V1
    class FdrWifiUploadsController < ApplicationController
      MAX_MANIFEST_BYTES = 4.kilobytes
      MAX_CHUNK_BYTES = 256.kilobytes

      rescue_from FdrWifiUpload::OffsetMismatch, with: :render_offset_mismatch

      allow_unauthenticated_access only: %i[create chunk complete]
      skip_forgery_protection only: %i[create chunk complete]
      before_action :read_body
      before_action :authenticate_recorder
      before_action :set_upload, only: %i[chunk complete]

      def create
        return head :payload_too_large if @body.bytesize > MAX_MANIFEST_BYTES

        manifest = JSON.parse(@body).symbolize_keys.slice(
          :filename, :file_index, :boot_id, :format_version, :size_bytes, :sha256
        )
        upload = @recorder.fdr_wifi_uploads.find_or_initialize_by(
          boot_id: Integer(manifest.fetch(:boot_id)),
          file_index: Integer(manifest.fetch(:file_index))
        )
        created = upload.new_record?
        if created
          upload.assign_attributes(manifest)
          upload.save!
        elsif !upload.manifest_matches?(manifest)
          return render json: { error: "This recorder file already has a different upload manifest." }, status: :conflict
        end
        upload.reconcile_received_bytes! if upload.status == "receiving"
        render_upload(upload, status: created ? :created : :ok)
      rescue JSON::ParserError, KeyError, ArgumentError, TypeError, ActiveRecord::RecordInvalid => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def chunk
        return head :payload_too_large if @body.bytesize > MAX_CHUNK_BYTES
        return render json: { error: "Upload chunks cannot be empty." }, status: :unprocessable_entity if @body.empty?

        @upload.append_chunk!(offset: Integer(request.headers.fetch("X-FDR-Upload-Offset")), bytes: @body)
        render_upload(@upload, status: :ok)
      rescue KeyError, ArgumentError, TypeError => error
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def complete
        return render json: { error: "Upload completion requests must be empty." }, status: :unprocessable_entity if @body.present?

        @upload.begin_verification!
        FdrWifiUploadFinalizeJob.perform_later(@upload)
        render_upload(@upload.reload, status: @upload.status == "complete" ? :ok : :accepted)
      end

      private

      def read_body
        limit = action_name == "create" ? MAX_MANIFEST_BYTES : MAX_CHUNK_BYTES
        if request.content_length.to_i > limit
          head :payload_too_large
          return
        end

        @body = request.raw_post.b
      end

      def authenticate_recorder
        operation = case action_name
        when "create"
          "create"
        when "chunk"
          "chunk:#{params[:token]}:#{request.headers['X-FDR-Upload-Offset']}"
        else
          "complete:#{params[:token]}"
        end
        @recorder = FdrDeviceRequestAuthentication.new(
          request:,
          body: @body,
          operation:
        ).authenticate
        head :unauthorized unless @recorder
      end

      def set_upload
        @upload = @recorder.fdr_wifi_uploads.find_by!(token: params[:token])
      end

      def render_upload(upload, status:)
        response.headers["X-FDR-Upload-Token"] = upload.token
        response.headers["X-FDR-Upload-Offset"] = upload.received_bytes.to_s
        response.headers["X-FDR-Upload-Status"] = upload.status
        render json: {
          token: upload.token,
          offset: upload.received_bytes,
          status: upload.status,
          error: upload.error_message
        }.compact, status:
      end

      def render_offset_mismatch(error)
        response.headers["X-FDR-Upload-Offset"] = error.expected_offset.to_s
        render json: { error: error.message, offset: error.expected_offset }, status: :conflict
      end
    end
  end
end
