require "test_helper"
require "tempfile"
require "zip"
require_relative "../../support/exo_fdr_binary"
require_relative "../../support/method_replacement"

class FlightImports::StreamingImportTest < ActiveSupport::TestCase
  include ExoFdrBinary
  include MethodReplacement

  test "sample buffers replay exact timestamps beyond the former pressure sample limit" do
    buffer = FlightImports::SampleBuffer.new
    sample = { recorded_at: Time.utc(2026, 9, 5, 12, 0, 0, 123_456), readings: { "x" => 1.25 }, sensor_type: "BARO" }
    100_001.times { buffer << sample }
    assert_equal 100_001, buffer.size
    2.times { assert_equal sample, buffer.first }
    assert_equal 100_001, buffer.count
  ensure
    buffer&.close
  end

  test "sparse sequence bitmap deduplicates nonadjacent pages including the uint32 endpoint" do
    seen = ExoFdr::SequenceSet.new
    [ 0, 32768, 0xffffffff, 7 ].each { |sequence| assert seen.add?(sequence) }
    [ 7, 0, 32768, 0xffffffff ].each { |sequence| assert_not seen.add?(sequence) }
    assert_raises(ExoFdr::Error) { seen.add?(0x100000000) }
  ensure
    seen&.close
  end

  test "FDR streams more than one insertion batch and removes replay across batches" do
    records = (0...1_005).map { |sequence| { sequence:, timestamp_us: sequence * 100_000 } }
    import = fdr_import(fdr_binary(records + records.last(5)))
    ExoFdr::ImportService.new(import).call
    assert_equal 1_005, import.flights.first.sensor_sample_count
    assert_equal 1_005, import.flights.first.sensor_samples.count
    assert_equal 5, import.details.dig("files", 0, "recovery", "duplicate_records")
  end

  test "a failed insertion rolls back earlier batches and keeps the source" do
    import = fdr_import(fdr_binary((0...1_005).map { |sequence| { sequence:, timestamp_us: sequence * 100_000 } }))
    before_files = Dir.glob(File.join(Dir.tmpdir, "flight-samples*"))
    insert = SensorSample.method(:insert_all!)
    batches = 0
    failure = lambda do |records|
      batches += 1
      raise IOError, "storage unavailable" if batches == 2

      insert.call(records)
    end
    replace_method(SensorSample, :insert_all!, failure) do
      assert_no_difference [ -> { Flight.count }, -> { SensorSample.count } ] do
        assert_raises(IOError) { ExoFdr::ImportService.new(import).call }
      end
    end
    assert_equal 2, batches
    assert_equal "failed", import.reload.status
    assert_equal "storage unavailable", import.error_message
    assert import.source_files.attached?
    assert_equal before_files, Dir.glob(File.join(Dir.tmpdir, "flight-samples*"))
  end

  test "ZIP archives exceeding the former entry limit import and clean temporary files" do
    archive = Tempfile.new([ "recording", ".zip" ])
    Zip::File.open(archive.path, create: true) do |zip|
      256.times { |index| zip.get_output_stream("#{index}.txt") { |io| io.write("ignored") } }
      zip.get_output_stream("SESSION.CSV") { |io| io.write(file_fixture("flysight_v1/SESSION.CSV").read) }
    end
    import = users(:julien).flight_imports.create!(source_filename: "recording.zip", import_type: "flysight", status: "pending")
    File.open(archive.path) { |io| import.source_files.attach(io:, filename: "recording.zip") }
    before_files = Dir.glob(File.join(Dir.tmpdir, "flysight-import*"))
    FlySight::ImportService.new(import).call
    assert_equal "imported", import.reload.status
    assert_equal 1, import.flights.count
    assert_equal 4, import.flights.first.track_points.count
    assert_equal before_files, Dir.glob(File.join(Dir.tmpdir, "flysight-import*"))
    assert import.source_files.attached?
  ensure
    archive&.close!
  end

  test "CSV line and header limits fail before retaining oversized input" do
    error = assert_raises(FlySight::Error) { FlySight::ParseV1.new("x" * 16_385).call }
    assert_includes error.message, "16 KiB"
    header = ("$VAR,X,y\n" * 257) + "$DATA\n"
    error = assert_raises(FlySight::Error) { FlySight::ParseV2.new(header, "").call }
    assert_includes error.message, "256 lines"
  end
end
