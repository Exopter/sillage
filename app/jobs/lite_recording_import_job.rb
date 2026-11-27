# Lite recordings are stored as received. The Lite decoder is not implemented
# yet: the job marks the upload as waiting for it so a later import can pick it up.
class LiteRecordingImportJob < ApplicationJob
  queue_as :imports

  def perform(upload)
    upload.update!(status: "awaiting_decoder") if upload.status == "queued"
  end
end
