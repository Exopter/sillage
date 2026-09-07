require "test_helper"
require_relative "../../support/method_replacement"

class Flights::DeleteRecordingTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper
  include MethodReplacement

  test "explicit flight deletion removes its import measurements sessions and files" do
    flight = flights(:one)
    import = flight.flight_import
    source = attach(import.source_files, "flight.bin")
    video = attach(flight.video, "replay.mp4", content_type: "video/mp4")
    upload = attach(flight.video_upload, "original.mov", content_type: "video/quicktime")
    session = flight.signal_sessions.create!(user: flight.user)
    capture = attach(session.raw_capture, "capture.json")
    batch = session.signal_batches.create!(sequence: 0)
    event = session.operator_events.create!(flight:, label: "Exit")
    recording = FdrRecording.create!(user: flight.user, recorder_key: import.device_id, boot_id: 42)
    flight.track_points.update_all(source_blob_id: source.id, fdr_recording_id: recording.id, fdr_sequence: 1)
    flight.sensor_samples.update_all(source_blob_id: source.id, fdr_recording_id: recording.id, fdr_sequence: 2)
    targeted = flight.user.flight_imports.create!(target_flight: flight, status: "pending")
    target_source = attach(targeted.source_files, "later.bin")
    blobs = [ source, video, upload, capture, target_source ]

    assert_enqueued_jobs 1, only: PurgeFlightDataJob do
      Flights::DeleteRecording.new(flight:).call
    end
    [ flight, import, session, batch, event, recording, targeted ].each do |record|
      assert_not record.class.exists?(record.id), "#{record.class} must be deleted"
    end
    assert_empty TrackPoint.where(flight_id: flight.id)
    assert_empty SensorSample.where(flight_id: flight.id)
    assert_empty ActiveStorage::Attachment.where(blob_id: blobs.map(&:id))
    blobs.each { |blob| assert blob.service.exist?(blob.key), "files are removed only by committed cleanup" }
    2.times { PurgeFlightDataJob.perform_now(blobs.map(&:id)) }
    blobs.each do |blob|
      assert_not ActiveStorage::Blob.exists?(blob.id)
      assert_not blob.service.exist?(blob.key)
    end
    assert Flight.exists?(flights(:two).id)
  end

  test "a shared multi-flight source survives until the last flight is deleted" do
    flight = flights(:one)
    import = flight.flight_import
    blob = attach(import.source_files, "sessions.zip")
    sibling = import.flights.create!(user: flight.user, name: "Other session")

    Flights::DeleteRecording.new(flight:).call
    assert Flight.exists?(sibling.id)
    assert FlightImport.exists?(import.id)
    assert import.reload.source_files.attached?
    PurgeFlightDataJob.perform_now([ blob.id ])
    assert_equal "recorded data", blob.download

    Flights::DeleteRecording.new(flight: sibling).call
    PurgeFlightDataJob.perform_now([ blob.id ])
    assert_not FlightImport.exists?(import.id)
    assert_not ActiveStorage::Blob.exists?(blob.id)
  end

  test "exclusive source files are removed from a surviving shared import" do
    flight = flights(:one)
    import = flight.flight_import
    deleted_source = attach(import.source_files, "first.bin")
    retained_source = attach(import.source_files, "second.bin")
    sibling = import.flights.create!(user: flight.user, name: "Other recording")
    flight.track_points.update_all(source_blob_id: deleted_source.id)
    sibling.track_points.create!(elapsed_seconds: 0, source_blob_id: retained_source.id)
    import.update!(details: { "files" => [ { "source_blob_id" => deleted_source.id }, { "source_blob_id" => retained_source.id } ] },
      activity_summary: { "segments" => [ { "filename" => "first.bin", "duration_seconds" => 20, "boot_id" => 1 },
        { "filename" => "second.bin", "duration_seconds" => 30, "boot_id" => 2 } ] })

    Flights::DeleteRecording.new(flight:).call
    PurgeFlightDataJob.perform_now([ deleted_source.id, retained_source.id ])
    assert_not ActiveStorage::Blob.exists?(deleted_source.id)
    assert_equal [ retained_source.id ], import.reload.source_files.blobs.pluck(:id)
    assert_equal [ { "source_blob_id" => retained_source.id } ], import.details["files"]
    assert_equal "second.bin", import.source_filename
    assert_equal [ 2 ], import.activity_summary["boot_ids"]
    assert_equal 30, import.activity_summary["duration_seconds"]
    assert_equal "recorded data", retained_source.download
  end

  test "deleting an import removes every child flight and a missing blob" do
    import = flight_imports(:one)
    import.flights.create!(user: import.user, name: "Second session")
    ids = import.flights.pluck(:id)
    blob = attach(import.source_files, "missing.bin")
    blob.service.delete(blob.key)
    Flights::DeleteRecording.new(flight_import: import).call
    PurgeFlightDataJob.perform_now([ blob.id ])
    assert_empty Flight.where(id: ids)
    assert_not FlightImport.exists?(import.id)
    assert_not ActiveStorage::Blob.exists?(blob.id)
  end

  test "cleanup respects attachments and telemetry belonging to other recordings" do
    import = flight_imports(:one)
    other = flight_imports(:two)
    blob = attach(import.source_files, "shared.bin")
    other.source_files.attach(blob)
    Flights::DeleteRecording.new(flight_import: import).call
    PurgeFlightDataJob.perform_now([ blob.id ])
    assert_equal "recorded data", other.source_files.first.download
    other.flights.first.track_points.update_all(source_blob_id: blob.id)
    other.source_files.detach
    PurgeFlightDataJob.perform_now([ blob.id ])
    assert_equal "recorded data", blob.download
    Flights::DeleteRecording.new(flight_import: other).call
    PurgeFlightDataJob.perform_now([ blob.id ])
    assert_not ActiveStorage::Blob.exists?(blob.id)
  end

  test "queue failure rolls back domain deletion and leaves every source accessible" do
    flight = flights(:one)
    import = flight.flight_import
    blob = attach(import.source_files, "original.bin")
    session = flight.signal_sessions.create!(user: flight.user)
    replace_method(PurgeFlightDataJob, :perform_later, ->(*) { false }) do
      assert_raises ActiveJob::EnqueueError do
        Flight.transaction(requires_new: true) { Flights::DeleteRecording.new(flight:).call }
      end
    end
    assert Flight.exists?(flight.id)
    assert FlightImport.exists?(import.id)
    assert SignalSession.exists?(session.id)
    assert_equal 1, flight.reload.track_points.count
    assert_equal "recorded data", import.reload.source_files.first.download
    assert blob.service.exist?(blob.key)
  end

  test "storage deletion failure retains the object key for a successful retry" do
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("recorded data"), filename: "retry.bin")
    replace_method(blob.service, :delete, ->(*) { raise IOError, "Storage unavailable" }) do
      assert_raises IOError do
        PurgeFlightDataJob.new.perform([ blob.id ])
      end
    end
    assert ActiveStorage::Blob.exists?(blob.id)
    assert blob.service.exist?(blob.key)
    PurgeFlightDataJob.perform_now([ blob.id ])
    assert_not ActiveStorage::Blob.exists?(blob.id)
    assert_not blob.service.exist?(blob.key)
  end

  test "production cleanup and domain deletion roll back in the same database transaction" do
    import = flight_imports(:one)
    blob = attach(import.source_files, "rollback.bin")
    original_adapter = PurgeFlightDataJob.queue_adapter
    PurgeFlightDataJob.queue_adapter = :solid_queue
    before_jobs = SolidQueue::Job.count
    Flight.transaction(requires_new: true) do
      Flights::DeleteRecording.new(flight_import: import).call
      assert_equal before_jobs + 1, SolidQueue::Job.count
      raise ActiveRecord::Rollback
    end
    assert_equal before_jobs, SolidQueue::Job.count
    assert FlightImport.exists?(import.id)
    assert_equal "recorded data", blob.download
  ensure
    PurgeFlightDataJob.queue_adapter = original_adapter if original_adapter
  end

  test "ordinary derived-flight replacement does not delete its original import" do
    flight = flights(:one)
    import = flight.flight_import
    blob = attach(import.source_files, "original.bin")
    flight.destroy!
    assert FlightImport.exists?(import.id)
    assert_equal "recorded data", blob.download
  end

  test "Wi-Fi staging survives rollback and is removed when deletion commits" do
    import = flight_imports(:one)
    attach(import.source_files, "original.bin")
    controller = create_embedded_controller(device_id: "ECU-DE1E7E")
    upload = FdrWifiUpload.create!(embedded_controller: controller, flight_import: import, status: "complete",
      filename: "FDR000001.BIN", file_index: 1, boot_id: 42, format_version: 3, size_bytes: 4, sha256: "a" * 64)
    FileUtils.mkdir_p(upload.staged_path.dirname)
    File.binwrite(upload.staged_path, "data")
    replace_method(PurgeFlightDataJob, :perform_later, ->(*) { false }) do
      assert_raises ActiveJob::EnqueueError do
        Flight.transaction(requires_new: true) { Flights::DeleteRecording.new(flight_import: import).call }
      end
    end
    assert FdrWifiUpload.exists?(upload.id)
    assert File.exist?(upload.staged_path)
    Flights::DeleteRecording.new(flight_import: import.reload).call
    assert_not FdrWifiUpload.exists?(upload.id)
    assert_not File.exist?(upload.staged_path)
    assert EmbeddedController.exists?(controller.id)
  ensure
    FileUtils.rm_f(upload.staged_path) if upload
  end

  test "an unused boot identity is retained while another raw recording references it" do
    import = flight_imports(:one)
    import.update!(activity_summary: { "boot_ids" => [ 42 ] })
    other = flight_imports(:two)
    other.update!(activity_summary: { "boot_ids" => [ 42 ] })
    recording = FdrRecording.create!(user: import.user, recorder_key: import.device_id, boot_id: 42)
    Flights::DeleteRecording.new(flight_import: import).call
    assert FdrRecording.exists?(recording.id)
    Flights::DeleteRecording.new(flight_import: other).call
    assert_not FdrRecording.exists?(recording.id)
  end

  private

  def attach(association, filename, content_type: "application/octet-stream")
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("recorded data"), filename:, content_type:)
    association.attach(blob)
    blob
  end
end
