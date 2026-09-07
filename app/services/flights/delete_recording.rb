module Flights
  # Explicit operator deletion. Import processors still use ordinary destroy!
  # when replacing derived flights, without deleting their source import.
  class DeleteRecording
    def initialize(flight: nil, flight_import: nil)
      raise ArgumentError, "Select one flight or recording." unless [ flight, flight_import ].compact.one?

      @flight, @flight_import = flight, flight_import
      @user = (flight || flight_import).user
      @blob_ids = []
      @recording_ids = []
    end

    def call
      Flight.transaction do
        flight_ids = @flight ? [ @flight.id ] : @flight_import.flights.pluck(:id)
        related = @user.flight_imports.where(id: [ @flight&.flight_import_id, @flight_import&.id ].compact)
          .or(@user.flight_imports.where(target_flight_id: flight_ids))
        # Wi-Fi finalization locks upload before import; Signal completion locks
        # session before flight. Follow those same orders during deletion.
        FdrWifiUpload.where(flight_import_id: related.select(:id)).order(:id).lock.load
        imports = related.order(:id).lock.to_a
        if @flight_import
          raise ActiveRecord::RecordNotFound unless imports.any? { |entry| entry.id == @flight_import.id }

          flight_ids = @flight_import.flights.reload.pluck(:id)
        end
        sessions = SignalSession.where(flight_id: flight_ids).order(:id).lock.to_a
        flights = @user.flights.where(id: flight_ids).order(:id).lock.to_a
        raise ActiveRecord::RecordNotFound unless flights.size == flight_ids.size

        source_ids = sample_identifiers(flight_ids, :source_blob_id)
        @blob_ids.concat(source_ids)
        @recording_ids.concat(sample_identifiers(flight_ids, :fdr_recording_id))
        imports.each { |entry| collect_recording_ids(entry) }
        sessions.each do |session|
          detach_files(session)
          session.destroy!
        end
        imports.each do |entry|
          entry.update!(target_flight_id: nil) if flight_ids.include?(entry.target_flight_id)
        end
        flights.each do |flight|
          detach_files(flight)
          flight.destroy!
        end
        imports.each do |entry|
          if entry.flights.reload.empty?
            entry.fdr_wifi_uploads.destroy_all
            detach_files(entry)
            entry.destroy!
          else
            detach_exclusive_sources(entry, source_ids)
          end
        end
        remove_unused_recording_identities
        unless @blob_ids.empty?
          raise ActiveJob::EnqueueError, "File cleanup could not be queued." unless PurgeFlightDataJob.perform_later(@blob_ids.uniq)
        end
      end
      @blob_ids.uniq
    end

    private

    def sample_identifiers(flight_ids, column)
      [ TrackPoint, SensorSample ].flat_map do |model|
        model.where(flight_id: flight_ids).where.not(column => nil).distinct.pluck(column)
      end.uniq
    end

    def detach_files(record, blob_ids: nil)
      attachments = ActiveStorage::Attachment.where(record:)
      attachments = attachments.where(blob_id: blob_ids) if blob_ids
      @blob_ids.concat(attachments.pluck(:blob_id))
      # Queue one durable purge after all domain rows are removed. Avoid the
      # attachment callback scheduling one purge per file after commit.
      attachments.delete_all
      record.reload
    end

    def detach_exclusive_sources(entry, source_ids)
      removable = entry.source_files.blobs.where(id: source_ids).reject do |blob|
        TrackPoint.where(source_blob_id: blob.id).exists? || SensorSample.where(source_blob_id: blob.id).exists?
      end
      return if removable.empty?

      removed_ids = removable.map(&:id)
      names = removable.map { |blob| blob.filename.to_s }
      detach_files(entry, blob_ids: removed_ids)
      details = entry.details.to_h.deep_dup
      details["files"]&.reject! { |file| removed_ids.include?(file["source_blob_id"]) }
      summary = entry.activity_summary.deep_dup
      if summary["segments"]
        summary["segments"].reject! { |segment| names.include?(segment["filename"]) }
        summary["duration_seconds"] = summary["segments"].sum { |segment| segment["duration_seconds"].to_f }
        summary["boot_ids"] = summary["segments"].map { |segment| segment["boot_id"] }.uniq
      end
      entry.update!(details:, activity_summary: summary, source_filename: entry.source_files.map { |source| source.filename.to_s }.join(", "))
    end

    def collect_recording_ids(entry)
      boots = entry.activity_summary["boot_ids"].to_a + entry.details.to_h["files"].to_a.filter_map { |file| file.dig("header", "boot_id") }
      key = entry.device_id.presence || "unidentified-import/#{entry.id}"
      @recording_ids.concat(FdrRecording.where(user: @user, recorder_key: key, boot_id: boots.uniq).pluck(:id))
    end

    def remove_unused_recording_identities
      FdrRecording.where(user: @user, id: @recording_ids.uniq).order(:id).lock.each do |recording|
        next if TrackPoint.where(fdr_recording_id: recording.id).exists? || SensorSample.where(fdr_recording_id: recording.id).exists?
        remaining = @user.flight_imports.where(device_id: recording.recorder_key)
        if recording.recorder_key.start_with?("unidentified-import/")
          remaining = remaining.or(@user.flight_imports.where(id: recording.recorder_key.delete_prefix("unidentified-import/")))
        end
        next if remaining.any? do |entry|
          entry.activity_summary["boot_ids"].to_a.include?(recording.boot_id) ||
            entry.details.to_h["files"].to_a.any? { |file| file.dig("header", "boot_id") == recording.boot_id }
        end

        recording.destroy!
      end
    end
  end
end
