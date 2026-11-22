class VideoUploadCleanupJob < ApplicationJob
  queue_as :default

  def perform
    Flights::ChunkedVideoUpload.sweep
  end
end
