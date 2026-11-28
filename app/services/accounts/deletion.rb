module Accounts
  # Deletes an account at its owner's request, from the mobile app. Removes the
  # owner's flights, recordings, comments, feedback, folders, recorders and
  # credentials. Records owned by other accounts can still name the user: flights
  # an operator recorded for this pilot, Signal sessions, shared Wi-Fi
  # credentials. In that case the row stays as a disabled placeholder with no
  # email, name, password or avatar, so those records keep their integrity.
  class Deletion
    PLACEHOLDER_DOMAIN = "deleted.invalid"

    def initialize(user)
      @user = user
      @blob_ids = []
    end

    def call
      User.transaction do
        @user.lock!
        delete_recordings
        delete_flights
        delete_owned_content
        release_recorders
        DeviceActivity.where(actor: @user).update_all(actor_id: nil)
        delete_credentials

        if referenced_by_other_accounts?
          anonymize
        else
          @user.destroy!
        end
        queue_file_purge
      end
    end

    private

    # Uploads first: they reference the imports and recorder ownerships removed below.
    def delete_recordings
      @user.lite_recording_uploads.find_each do |upload|
        detach_files(upload)
        upload.delete
      end
    end

    def delete_flights
      @user.flight_imports.find_each { |import| Flights::DeleteRecording.new(flight_import: import).call }
      @user.flights.reload.find_each { |flight| Flights::DeleteRecording.new(flight:).call }
    end

    def delete_owned_content
      @user.flight_comments.find_each do |comment|
        detach_files(comment)
        comment.destroy!
      end
      @user.feedbacks.find_each do |feedback|
        detach_files(feedback)
        feedback.destroy!
      end
      @user.flight_folders.destroy_all
      FlightFolderMembership.where(user: @user).delete_all
    end

    def release_recorders
      RecorderClaim.where(user: @user).delete_all
      @user.recorder_ownerships.active.find_each(&:unlink!)
      RecorderOwnership.where(user: @user).delete_all
    end

    def delete_credentials
      AppToken.where(user: @user).delete_all
      Session.where(user: @user).delete_all
      detach_files(@user)
    end

    def referenced_by_other_accounts?
      @user.piloted_flights.exists? || @user.signal_sessions.exists? || @user.created_wifi_credentials.exists?
    end

    def anonymize
      @user.update_columns(
        email_address: "deleted-#{@user.id}@#{PLACEHOLDER_DOMAIN}",
        first_name: nil, last_name: nil, password_digest: nil,
        otp_secret_ciphertext: nil, otp_enabled_at: nil, otp_last_verified_at: nil,
        disabled_at: Time.current, updated_at: Time.current
      )
    end

    def detach_files(record)
      attachments = ActiveStorage::Attachment.where(record:)
      @blob_ids.concat(attachments.pluck(:blob_id))
      attachments.delete_all
    end

    def queue_file_purge
      return if @blob_ids.empty?

      raise ActiveJob::EnqueueError, "File cleanup could not be queued." unless PurgeFlightDataJob.perform_later(@blob_ids.uniq)
    end
  end
end
