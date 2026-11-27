require "digest"

module Api
  module App
    module V1
      module Recorders
        # Original recording files offloaded through the app. The body is the raw
        # file; size and SHA-256 are checked before anything is stored.
        class RecordingsController < BaseController
          MAX_BYTES = 1.gigabyte
          READ_BLOCK = 1.megabyte
          SHA256_HEADER = /\A[0-9a-fA-F]{64}\z/

          before_action :set_ownership

          def update
            file_id = Integer(params[:file_id], 10, exception: false)
            unless LiteRecordingUpload::FILE_IDS.cover?(file_id)
              return render_error :unprocessable_entity, "invalid_file_id", "The file id must be an unsigned 32-bit number."
            end

            expected_sha256 = request.headers["X-Content-SHA256"].to_s
            return render_error :unprocessable_entity, "invalid_digest", "X-Content-SHA256 must be a hexadecimal SHA-256." unless expected_sha256.match?(SHA256_HEADER)

            expected_sha256 = expected_sha256.downcase
            length = request.content_length.to_i
            return render_error :length_required, "length_required", "Content-Length is required." unless length.positive?
            return render_error :content_too_large, "too_large", "Recordings are limited to #{MAX_BYTES / 1.megabyte} MiB." if length > MAX_BYTES

            existing = @ownership.embedded_controller.lite_recording_uploads.find_by(sha256: expected_sha256)
            return render_receipt(existing, "duplicate") if existing

            Tempfile.create([ "lite-recording", ".bin" ], binmode: true) do |file|
              size, digest = copy_body(file)
              return render_error :unprocessable_entity, "size_mismatch", "The body does not match Content-Length." unless size == length
              return render_error :unprocessable_entity, "digest_mismatch", "The body does not match X-Content-SHA256." unless digest == expected_sha256

              file.rewind
              upload = store(file, file_id:, size:, sha256: digest)
              LiteRecordingImportJob.perform_later(upload)
              render_receipt(upload, "accepted", status: :created)
            end
          rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid
            existing = @ownership.embedded_controller.lite_recording_uploads.find_by(sha256: expected_sha256)
            raise unless existing

            render_receipt(existing, "duplicate")
          end

          private

          def set_ownership
            @ownership = current_user.recorder_ownerships.active.includes(:embedded_controller).find_by(id: params[:recorder_id])
            render_error :not_found, "not_found", "This recorder is not linked to your account." unless @ownership
          end

          def copy_body(file)
            digest = Digest::SHA256.new
            size = 0
            body = request.body
            body.rewind if body.respond_to?(:rewind)
            while (block = body.read(READ_BLOCK))
              size += block.bytesize
              break if size > MAX_BYTES

              digest.update(block)
              file.write(block)
            end
            file.flush
            [ size, digest.hexdigest ]
          end

          def store(file, file_id:, size:, sha256:)
            LiteRecordingUpload.transaction do
              upload = @ownership.lite_recording_uploads.new(
                embedded_controller: @ownership.embedded_controller, user: current_user,
                file_id:, byte_size: size, sha256:
              )
              upload.original.attach(io: file, filename: upload.filename, content_type: "application/octet-stream")
              upload.save!
              upload
            end
          end

          def render_receipt(upload, receipt_status, status: :ok)
            render json: { status: receipt_status, sha256: upload.sha256, flight_code: upload.flight_code }, status:
          end
        end
      end
    end
  end
end
