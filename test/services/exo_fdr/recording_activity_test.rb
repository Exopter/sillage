require "test_helper"
require_relative "../../support/exo_fdr_binary"

class ExoFdr::RecordingActivityTest < ActiveSupport::TestCase
  include ExoFdrBinary
  include ActiveJob::TestHelper

  test "mixed source imports keep stationary boundaries with the moving recording" do
    import = users(:julien).flight_imports.new(device_id: "ECU-ABC123")
    result = ExoFdr::RecordingActivity.new(import).summarize([
      segment("stationary", 0, 30), segment("moving", 30, 120), segment("technical", 120, 121)
    ])
    assert_equal "moving", result["classification"]
    assert_equal 3, result["segments"].size
  end

  test "adjacent stationary imports become visible regardless of arrival order" do
    moving = create_import("moving", 40, 100)
    stationary = create_import("stationary", 0, 30)
    result = ExoFdr::RecordingActivity.new(stationary).summarize([ segment("stationary", 0, 30) ])
    assert_equal "needs_review", result["classification"]
    assert_equal "related_recording_activity", result["reason"]

    assert_enqueued_jobs 1, only: ExoFdrImportJob do
      2.times { ExoFdr::RecordingActivity.new(moving).reconcile! }
    end
    assert_equal "pending", stationary.reload.status
    assert_not stationary.set_aside?
    assert_nil stationary.included_in_flights_at, "automatic context must not pretend to be a manual choice"
  end

  test "unrelated boots recorders and users never promote each other's recordings" do
    moving = create_import("moving", 40, 100)
    other_boot = create_import("stationary", 0, 30, boot: 2)
    other_device = create_import("stationary", 0, 30, device_id: "ECU-ABC124")
    other_user = create_import("stationary", 0, 30, user: users(:operator))
    distant = create_import("stationary", 1_000, 1_100)
    assert_no_enqueued_jobs only: ExoFdrImportJob do
      ExoFdr::RecordingActivity.new(moving).reconcile!
    end
    [ other_boot, other_device, other_user, distant ].each { |entry| assert entry.reload.set_aside? }
  end

  test "existing flights remain intact when related context promotes an archive" do
    moving = create_import("moving", 40, 100)
    stationary = create_import("stationary", 0, 30)
    flight = stationary.flights.create!(name: "Existing recording", user: stationary.user)
    assert_no_enqueued_jobs only: ExoFdrImportJob do
      ExoFdr::RecordingActivity.new(moving).reconcile!
    end
    assert stationary.reload.imported?
    assert_not stationary.set_aside?
    assert_equal flight.id, stationary.flights.sole.id
  end

  test "backfill is idempotent and preserves original samples and source attachments" do
    payload = [ 40, 6, "Storage ready" ].pack("vCa48")
    import = fdr_import(fdr_binary([ { type: 4, payload:, sequence: 0, timestamp_us: 1_000_000 } ]), status: "imported")
    flight = import.flights.create!(name: "Historical diagnostic", user: import.user)
    source = import.source_files.first.download
    assert_no_difference [ -> { Flight.count }, -> { SensorSample.count }, -> { ActiveStorage::Attachment.count } ] do
      assert_equal({ "technical" => 1 }, ExoFdr::BackfillActivity.new.call(scope: FlightImport.where(id: import.id)))
      assert_equal({}, ExoFdr::BackfillActivity.new.call(scope: FlightImport.where(id: import.id)))
    end
    assert import.reload.set_aside?
    assert_equal source, import.source_files.first.download
    assert_equal flight.id, import.flights.sole.id
  end

  test "missing historical source stays visible and operator notes protect an existing flight" do
    import = fdr_import(fdr_binary([]), status: "imported")
    import.flights.create!(name: "Bench observation", user: import.user, notes: "Keep this test")
    ExoFdr::BackfillActivity.new.call(scope: FlightImport.where(id: import.id))
    assert import.reload.included_in_flights_at?
    assert_not import.set_aside?
    missing = fdr_import(fdr_binary([]), status: "imported")
    missing.source_files.first.blob.service.delete(missing.source_files.first.blob.key)
    ExoFdr::BackfillActivity.new.call(scope: FlightImport.where(id: missing.id))
    assert_equal "needs_review", missing.reload.activity_classification
    assert_equal "source_missing", missing.activity_summary["reason"]
  end

  test "unreadable sources are distinguished from missing files" do
    import = fdr_import("not an FDR binary", status: "imported")
    ExoFdr::BackfillActivity.new.call(scope: FlightImport.where(id: import.id))
    assert_equal "source_unreadable", import.reload.activity_summary["reason"]
    assert_not import.source_missing?

    missing = users(:julien).flight_imports.create!(import_type: "exofdr", status: "imported")
    ExoFdr::BackfillActivity.new.call(scope: FlightImport.where(id: missing.id))
    assert missing.reload.source_missing?
  end

  private

  def segment(classification, first, last, boot: 1)
    { "classification" => classification, "reason" => classification == "moving" ? "sustained_movement" : "stationary_with_reliable_gps",
      "boot_id" => boot, "min_us" => first * 1_000_000, "max_us" => last * 1_000_000, "duration_seconds" => last - first }
  end

  def create_import(classification, first, last, boot: 1, device_id: "ECU-ABC123", user: users(:julien))
    user.flight_imports.create!(import_type: "exofdr", device_id:, status: "imported", activity_classification: classification,
      activity_summary: { "boot_ids" => [ boot ], "segments" => [ segment(classification, first, last, boot:) ] })
  end
end
