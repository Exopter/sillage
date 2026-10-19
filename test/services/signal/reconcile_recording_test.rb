require "test_helper"
require_relative "../../support/exo_fdr_binary"

class Signal::ReconcileRecordingTest < ActiveSupport::TestCase
  include ExoFdrBinary
  include ActiveJob::TestHelper

  setup do
    @at = Time.utc(2026, 10, 16, 9, 23)
    @user = users(:julien)
    @device = "ECU-E072A1F81D84"
  end

  test "a collaborator's recording reconciles into a shared flight without changing its creator" do
    session = signal_session
    target = session.flight
    target.update!(user: users(:operator), visibility: "team")
    import = recording
    ExoFdr::ImportService.new(import).call
    assert_equal target.id, import.reload.target_flight_id
    assert_equal users(:operator), target.reload.user
    assert_equal @user, import.user
    assert_equal "analysed", target.status
    assert_equal target.id, session.reload.flight_id
  end

  test "automatic import keeps Signal context and radio evidence and moves authoritative FDR provenance" do
    session = signal_session
    target = session.flight
    folder = @user.flight_folders.create!(name: "Flight campaign", visibility: "shared", color: "aqua")
    target.update!(folder:, aircraft: aircraft(:exowing), notes: "Keep these notes", location: "Bouloc",
      configuration_snapshot: { "capture" => "original" })
    target.video.attach(io: StringIO.new("video"), filename: "flight.mp4", content_type: "video/mp4")
    event = session.operator_events.create!(uuid: SecureRandom.uuid, flight: target, event_type: "marker", occurred_at: @at, label: "Exit")
    context = target.attributes.except(*Flights::MergeRecording::RECORDING_ATTRIBUTES, "updated_at", "flight_import_id")
    import = recording
    assert_no_difference -> { Flight.count } do
      ExoFdr::ImportService.new(import).call
    end
    assert_equal target.id, import.reload.target_flight_id
    assert_equal [ target.id ], import.flights.pluck(:id)
    target.reload
    assert_equal context, target.attributes.except(*Flights::MergeRecording::RECORDING_ATTRIBUTES, "updated_at", "flight_import_id")
    assert target.video.attached?
    assert_equal target.id, event.reload.flight_id
    assert_equal "analysed", target.status
    assert_equal @at, target.started_at
    assert_equal 10, target.duration_seconds
    assert_equal 2, target.track_points.count
    assert_equal 1, target.sensor_samples.count
    assert_equal [ import.source_files.first.blob_id ], target.track_points.distinct.pluck(:source_blob_id)
    assert target.track_points.all? { |point| point.fdr_recording_id && point.fdr_sequence && point.fdr_timestamp_us }
    assert_equal 1, Signal::RadioHistory.new(session).rows.size
    assert_equal 1, session.signal_batches.count
    assert_no_difference [ -> { Flight.count }, -> { TrackPoint.count }, -> { SensorSample.count } ] do
      ExoFdr::ImportService.new(import.reload).call
      Flights::MergeRecording.new(flight_import: import, target_flight: target).call
    end
  end

  test "a recording imported before a session is saved is reconciled after completion" do
    session = signal_session(complete: false, assigned: false)
    import = recording
    ExoFdr::ImportService.new(import).call
    source_id = import.flights.sole.id
    Signal::CompleteSession.new(signal_session: session, disposition: "save", name: "Late save", ended_at: @at + 20).call
    assert_equal "processing", session.reload.flight.status
    Signal::ReconcileRecording.new(import).call
    assert_nil import.reload.target_flight_id
    assert Flight.exists?(source_id)
    perform_enqueued_jobs only: SignalMaterializationJob
    perform_enqueued_jobs only: SignalReconciliationJob
    assert_equal session.reload.flight_id, import.reload.target_flight_id
    assert_not Flight.exists?(source_id)
    assert_equal "Late save", session.flight.name
    assert_equal "analysed", session.flight.status
  end

  %w[device boot owner period identity_time ambiguous].each do |mismatch|
    test "#{mismatch} mismatch never merges a recording" do
      options = case mismatch
      when "device" then { device: "ECU-E072A1FA3E78" }
      when "boot" then { boot: 999 }
      when "owner" then { user: users(:operator) }
      when "period" then { time: @at - 1.hour }
      when "identity_time" then { identity_time: @at - 1.hour }
      else {}
      end
      signal_session(**options)
      signal_session if mismatch == "ambiguous"
      import = recording
      assert_difference -> { Flight.count }, 1 do
        ExoFdr::ImportService.new(import).call
      end
      assert_nil import.reload.target_flight_id
    end
  end

  test "already imported target is left untouched by another recording" do
    session = signal_session
    first = recording
    ExoFdr::ImportService.new(first).call
    original_samples = session.flight.reload.track_points.pluck(:id)
    second = recording(sequence_offset: 100)
    ExoFdr::ImportService.new(second).call
    assert_nil second.reload.target_flight_id
    assert_equal original_samples, session.flight.track_points.pluck(:id)
  end

  test "multiple matching sessions on the same flight are not ambiguous" do
    first = signal_session
    second = signal_session
    unused_flight = second.flight
    second.update!(flight: first.flight)
    unused_flight.destroy!
    import = recording
    ExoFdr::ImportService.new(import).call
    assert_equal first.flight_id, import.reload.target_flight_id
    assert_equal 2, first.flight.signal_sessions.count
  end

  test "a second active Signal session prevents replacement until it completes" do
    first = signal_session
    active = @user.signal_sessions.create!(flight: first.flight, started_at: @at)
    import = recording
    ExoFdr::ImportService.new(import).call
    assert_nil import.reload.target_flight_id
    active.complete!(ended_at: @at + 20)
    SignalReconciliationJob.perform_now(active)
    assert_equal first.flight_id, import.reload.target_flight_id
  end

  test "an import containing multiple flights cannot replace a single Signal flight" do
    signal_session
    import = recording
    other = recording(boot: 5678)
    import.source_files.attach(other.source_files.first.blob)
    ExoFdr::ImportService.new(import).call
    assert_nil import.reload.target_flight_id
    assert_equal 2, import.flights.count
  end

  test "unsafe manual merge rolls back without losing either flight" do
    session = signal_session(complete: false)
    import = recording
    ExoFdr::ImportService.new(import).call
    source = import.flights.sole
    session.complete!(ended_at: @at + 20)
    source.update!(notes: "New source context")
    assert_no_difference [ -> { Flight.count }, -> { TrackPoint.count }, -> { SignalBatch.count } ] do
      assert_raises(Flights::MergeRecording::InvalidMerge) do
        Flights::MergeRecording.new(flight_import: import, target_flight: session.flight).call
      end
    end
    assert_nil import.reload.target_flight_id
    assert_equal "waiting_for_recording", session.flight.reload.status
  end

  private

  def signal_session(device: @device, boot: 1234, user: @user, time: @at, identity_time: time,
    complete: true, assigned: true)
    flight = user.flights.create!(status: "live", name: "Signal context", started_at: time - 20.minutes) if assigned
    session = user.signal_sessions.create!(flight:, started_at: time - 20.minutes)
    Signal::IngestBatch.new(signal_session: session, sequence: 0, payload: { samples: [
      { kind: "sensor", sensor_type: "IMU_QUALITY", recorded_at: identity_time.iso8601, readings: { deviceId: device, bootId: boot } },
      { kind: "sensor", sensor_type: "RADIO", recorded_at: time.iso8601, readings: { rssi: 133, remoteRssi: 114, noise: 38, remoteNoise: 38 } },
      { kind: "gps", recorded_at: time.iso8601, latitude: 44, longitude: 1 }
    ] }).call
    session.complete!(ended_at: time + 20) if complete
    session
  end

  def recording(boot: 1234, sequence_offset: 0)
    gps = ->(seconds) { [ 123_456, @at.year, @at.month, @at.day, @at.hour, @at.min, seconds, 7, 80, 0, 3, 1, 0, 12,
      57_168_000, 441_994_000, 700_000, 642_000, 1_000, 1_500,
      20_000, 5_000, -1_000, 20_600, 3_600_000, 500, 10_000, 125 ].pack("VvC6Vl<C4l<4V2l<5V2v") }
    fdr_import(fdr_binary([
      { sequence: sequence_offset, timestamp_us: 1_000_000, type: 1, payload: gps.call(0) },
      { sequence: sequence_offset + 1, timestamp_us: 6_000_000 },
      { sequence: sequence_offset + 2, timestamp_us: 11_000_000, type: 1, payload: gps.call(10) }
    ], boot_id: boot), device_id: @device)
  end
end
