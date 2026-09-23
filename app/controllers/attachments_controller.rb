class AttachmentsController < ApplicationController
  include ActiveStorage::FileServer
  include ActiveStorage::Streaming

  def show
    attachment = ActiveStorage::Attachment.includes(:blob, :record).find(params[:id])
    raise ActiveRecord::RecordNotFound unless accessible?(attachment)

    no_store
    blob = attachment.blob
    disposition = attachment.record_type == "Flight" && attachment.name == "video" ? "inline" : "attachment"
    response.headers["Accept-Ranges"] = "bytes"
    if blob.service.is_a?(ActiveStorage::Service::DiskService)
      # Keep native file streaming and open-ended seeking for large local videos.
      serve_file(blob.service.path_for(blob.key), content_type: blob.content_type_for_serving,
        disposition: ActionDispatch::Http::ContentDisposition.format(
          disposition: blob.forced_disposition_for_serving || disposition, filename: blob.filename.sanitized))
    elsif request.headers["Range"].present?
      send_blob_byte_range_data(blob, request.headers["Range"], disposition:)
    else
      response.headers["Content-Length"] = blob.byte_size.to_s
      send_blob_stream(blob, disposition:)
    end
  rescue ActiveStorage::FileNotFoundError, ActiveStorage::InvalidKeyError, Errno::ENOENT
    head :not_found
  end

  private

  def accessible?(attachment)
    case record = attachment.record
    when Flight
      record.owned_by?(Current.user) || (attachment.name == "video" && record.visible_to?(Current.user))
    when FlightImport, SignalSession
      record.user_id == Current.user.id
    when TestRun
      true
    else
      false
    end
  end
end
