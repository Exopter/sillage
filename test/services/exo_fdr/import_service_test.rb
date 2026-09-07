require "test_helper"
require_relative "../../support/exo_fdr_binary"

class ExoFdr::ImportServiceTest < ActiveSupport::TestCase
  include ExoFdrBinary

  test "imports GPS without UTC and preserves relative sample times" do
    current = Assembly.create!(name: "Current recorder", assembly_type: "ExoFDR", assembly_method: "PERF", fdr_functional_configuration: create_fdr_functional_configuration)
    create_embedded_controller(assembly: current, device_id: "ECU-ABC123")
    payload = [ 123_456, 2026, 7, 29, 10, 11, 12, 0, 80, 0, 3, 1, 0, 12,
      57_168_000, 441_994_000, 700_000, 642_000, 1_000, 1_500,
      20_000, 5_000, -1_000, 20_600, 3_600_000, 500, 10_000, 125 ].pack("VvC6Vl<C4l<4V2l<5V2v")
    binary = fdr_binary([ 1, 6, 11 ].each_with_index.map do |time, sequence|
      { type: 1, payload:, timestamp_us: time * 1_000_000, sequence: }
    end)
    flight_import = fdr_import(binary)
    ExoFdr::ImportService.new(flight_import).call
    flight = flight_import.flights.sole
    assert_nil flight.started_at
    assert_nil flight.ended_at
    assert_nil flight.display_started_at
    assert_includes ApplicationController.helpers.logbook_date(flight), "Data unavailable"
    flight_import.update!(log_started_at: Time.utc(2026, 7, 29))
    assert_nil flight.reload.display_started_at, "a timestamp from another source segment must not date this flight"
    assert_equal [ 0, 5, 10 ], flight.track_points.ordered.pluck(:elapsed_seconds)
    assert_equal 10, flight.duration_seconds
    assert_match(/no absolute timestamp/, flight.configuration_snapshot.fetch("unavailable_reason"))
    assert_nil flight_import.details.dig("files", 0, "recorder_identity")
    assert_equal "Historical FDR identity unavailable", flight_import.recorder_label
  end

  test "imports sensor-only recordings and deduplicates shared recovery segments across imports" do
    fixture = recovery_fixture
    imports = fixture[:segments].map do |segment|
      fdr_import(fdr_binary(segment[:records], boot_id: fixture[:boot_id]))
    end
    imports.each { |flight_import| ExoFdr::ImportService.new(flight_import).call }
    recording = FdrRecording.find_by!(boot_id: fixture[:boot_id])
    samples = SensorSample.where(fdr_recording_id: recording.id).order(:fdr_sequence)
    assert_equal fixture[:expected_sequences], samples.pluck(:fdr_sequence)
    assert_equal [ 1_000_000, 6_000_000, 11_000_000 ], samples.pluck(:fdr_timestamp_us)
    assert_equal imports.map { |entry| entry.source_files.first.blob_id }.sort, samples.reorder(nil).distinct.pluck(:source_blob_id).sort
    assert_equal 1, imports.last.details.dig("files", 0, "recovery", "duplicate_records")
    assert_equal [ 1, 1 ], imports.map { |entry| entry.flights.count }, "source boundaries must remain distinct"
    assert_equal 5, imports.first.flights.sole.duration_seconds
    assert_nil imports.first.flights.sole.started_at

    replay = fdr_import(fdr_binary(fixture[:segments].first[:records], boot_id: fixture[:boot_id]))
    assert_no_difference -> { Flight.count } do
      ExoFdr::ImportService.new(replay).call
    end
    assert replay.imported?
  end

  test "a late UTC fix anchors the full recording including earlier and later sensor samples" do
    original = Assembly.create!(name: "Original recorder", assembly_type: "ExoFDR", assembly_method: "PERF", fdr_functional_configuration: create_fdr_functional_configuration)
    current = Assembly.create!(name: "Current recorder", assembly_type: "ExoFDR", assembly_method: "PERF", fdr_functional_configuration: original.fdr_functional_configuration)
    function = Function.find_or_create_by!(code: "CONTROLLER") { |record| record.name = "Controller" }
    part = Part.create!(function:, model: "XIAO ESP32S3")
    create_embedded_controller(part:, device_id: "ECU-ABC123")
    part.install_in!(original, at: Time.utc(2026, 7, 1))
    part.remove_from_assembly!(at: Time.utc(2026, 8, 1))
    part.install_in!(current, at: Time.utc(2026, 8, 2))
    gps_payload = [ 123_456, 2026, 7, 29, 10, 11, 6, 1, 80, 0, 3, 1, 0, 12,
      57_168_000, 441_994_000, 700_000, 642_000, 1_000, 1_500,
      20_000, 5_000, -1_000, 20_600, 3_600_000, 500, 10_000, 125 ].pack("VvC6Vl<C4l<4V2l<5V2v")
    invalid_utc = gps_payload.dup
    invalid_utc.setbyte(11, 0)
    binary = fdr_binary([
      { sequence: 0, timestamp_us: 1_000_000 },
      { sequence: 1, timestamp_us: 2_000_000, type: 1, payload: invalid_utc },
      { sequence: 2, timestamp_us: 7_000_000, type: 1, payload: gps_payload },
      { sequence: 3, timestamp_us: 8_000_000 }
    ])
    flight_import = fdr_import(binary)
    ExoFdr::ImportService.new(flight_import).call
    flight = flight_import.flights.sole
    assert_equal Time.utc(2026, 7, 29, 10, 11, 0), flight.started_at
    assert_equal flight.started_at + 7, flight.ended_at
    assert_equal [ 1, 6 ], flight.track_points.ordered.pluck(:elapsed_seconds)
    assert_equal [ 0, 7 ], flight.sensor_samples.ordered.pluck(:elapsed_seconds)
    assert_equal 7, flight.duration_seconds
    assert_equal original.serial_number, flight_import.details.dig("files", 0, "recorder_identity", "assembly", "serial_number")
    assert_equal "ECU-ABC123", flight_import.details.dig("files", 0, "recorder_identity", "device_id")
    assert_equal "#{original.serial_number}", flight_import.recorder_label
  end

  test "a replayed UTC anchor preserves the physical origin of a rotated file" do
    gps = [ 123_456, 2026, 7, 29, 10, 11, 6, 1, 80, 0, 3, 1, 0, 12,
      57_168_000, 441_994_000, 700_000, 642_000, 1_000, 1_500,
      20_000, 5_000, -1_000, 20_600, 3_600_000, 500, 10_000, 125 ].pack("VvC6Vl<C4l<4V2l<5V2v")
    anchor = { sequence: 1, timestamp_us: 7_000_000, type: 1, payload: gps }
    import = fdr_import(
      fdr_binary([ { sequence: 0, timestamp_us: 1_000_000 }, anchor ]),
      fdr_binary([ anchor, { sequence: 2, timestamp_us: 8_000_000 } ])
    )
    ExoFdr::ImportService.new(import).call
    rotated = import.flights.order(:id).last
    assert_equal Time.utc(2026, 7, 29, 10, 11, 6), rotated.started_at
    assert_equal [ 1 ], rotated.sensor_samples.pluck(:elapsed_seconds)
    assert_equal [ Time.utc(2026, 7, 29, 10, 11, 7) ], rotated.sensor_samples.pluck(:recorded_at)
    assert_equal 0, import.details.dig("files", 1, "recovery", "sequence_gaps")
    assert_equal 1, import.details.dig("files", 1, "recovery", "duplicate_records")
  end

  test "deduplicates a multi-file manual import without conflating unidentified recorders" do
    fixture = recovery_fixture
    binaries = fixture[:segments].map { |segment| fdr_binary(segment[:records], boot_id: fixture[:boot_id]) }
    first = fdr_import(*binaries, device_id: nil)
    ExoFdr::ImportService.new(first).call
    assert_equal 3, SensorSample.where(flight: first.flights).count
    other = fdr_import(binaries.first, device_id: nil)
    ExoFdr::ImportService.new(other).call
    assert_equal 2, SensorSample.where(flight: other.flights).count
  end

  test "same boot and sequence on another recorder remain distinct" do
    binary = fdr_binary([ { sequence: 0, timestamp_us: 1_000_000 } ])
    [ "ECU-ABC123", "ECU-ABC124" ].each do |device_id|
      flight_import = fdr_import(binary, device_id:)
      ExoFdr::ImportService.new(flight_import).call
      assert_equal 1, flight_import.flights.sole.sensor_samples.count
    end
  end

  test "repeated processing is idempotent and keeps the original flight" do
    flight_import = fdr_import(fdr_binary([ { sequence: 0, timestamp_us: 1_000_000 } ]))
    ExoFdr::ImportService.new(flight_import).call
    original = flight_import.flights.sole.id
    ExoFdr::ImportService.new(FlightImport.find(flight_import.id)).call
    assert_equal original, flight_import.flights.sole.id
  end
  test "anchors intermittent invalid UTC samples to the monotonic recording timeline" do
    records = [
      { "type" => "unknown", "timestamp_us" => 1_000_000 },
      gps_record(timestamp_us: 2_000_000, longitude_deg_e7: 10_000_000),
      gps_record(
        timestamp_us: 7_000_000,
        longitude_deg_e7: 60_000_000,
        utc: Time.utc(2026, 8, 18, 12, 0, 6)
      ),
      gps_record(timestamp_us: 8_000_000, longitude_deg_e7: 70_000_000),
      gps_record(
        timestamp_us: 9_000_000,
        longitude_deg_e7: 80_000_000,
        utc: Time.utc(2026, 8, 18, 12, 0, 8)
      )
    ]
    service = ExoFdr::ImportService.new(nil)

    points, = service.send(:records_to_samples, records)

    assert_equal Time.utc(2026, 8, 18, 12, 0, 0), service.send(:started_at_for, records)
    assert_equal [
      Time.utc(2026, 8, 18, 12, 0, 1),
      Time.utc(2026, 8, 18, 12, 0, 6),
      Time.utc(2026, 8, 18, 12, 0, 7),
      Time.utc(2026, 8, 18, 12, 0, 8)
    ], points.map { |point| point.fetch(:recorded_at) }
    assert_equal points.map { |point| point.fetch(:recorded_at) }.sort,
      points.map { |point| point.fetch(:recorded_at) }
  end

  private

  def gps_record(timestamp_us:, longitude_deg_e7:, utc: nil)
    {
      "type" => "gps_pvt",
      "timestamp_us" => timestamp_us,
      "utc_valid" => utc ? 1 : 0,
      "year" => utc&.year,
      "month" => utc&.month,
      "day" => utc&.day,
      "hour" => utc&.hour,
      "minute" => utc&.min,
      "second" => utc&.sec,
      "nano_seconds" => utc&.nsec.to_i,
      "latitude_deg_e7" => 440_000_000,
      "longitude_deg_e7" => longitude_deg_e7,
      "height_msl_mm" => 200_000,
      "velocity_north_mm_s" => 0,
      "velocity_east_mm_s" => 50_000,
      "velocity_down_mm_s" => 0,
      "horizontal_accuracy_mm" => 1_000,
      "vertical_accuracy_mm" => 1_500,
      "speed_accuracy_mm_s" => 500,
      "heading_motion_deg_e5" => 9_000_000,
      "heading_accuracy_deg_e5" => 10_000,
      "fix_type" => 3,
      "satellites" => 12
    }
  end
end
