class VideoUploadCleanupJob < ApplicationJob
  queue_as :default

  def perform
    Flights::DirectVideoUpload.sweep
  end
end
