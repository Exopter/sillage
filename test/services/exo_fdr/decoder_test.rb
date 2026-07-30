require "test_helper"
require "json"
require "open3"
require "stringio"
require "tempfile"
require "zlib"

class ExoFdr::DecoderTest < ActiveSupport::TestCase
  test "decodes the versioned binary format and all known record types" do
    result = ExoFdr::Decoder.new(StringIO.new(valid_file)).call

    assert_equal 3, result.header.fetch("format_version")
    assert_equal 1_234, result.header.fetch("boot_id")
    assert_equal "fdr-test", result.header.fetch("firmware")
    assert_equal %w[gps_pvt imu airspeed system_event marker], result.records.map { |record| record.fetch("type") }
    assert_in_delta 44.1994, result.records.first.fetch("latitude_deg_e7") / 1e7
    assert_in_delta 5.7168, result.records.first.fetch("longitude_deg_e7") / 1e7
    assert_equal "rotation_vector", result.records.second.fetch("sensor")
    assert_in_delta 53.2, result.records.third.fetch("airspeed_m_s")
    assert_equal "Pitot ready", result.records.fourth.fetch("text")
    assert_equal 73, result.records.fifth.fetch("marker_id")
    assert_equal 0, result.stats.fetch("crc_errors")
  end

  test "recovers after a corrupt record and reports a sequence gap" do
    corrupted = record(type: 2, sequence: 1, timestamp_us: 2_000_000, payload: imu_payload).dup
    corrupted.setbyte(corrupted.length - 1, corrupted.getbyte(corrupted.length - 1) ^ 0xff)
    binary = file_header + record(type: 1, sequence: 0, timestamp_us: 1_000_000, payload: gps_payload) + corrupted + record(type: 5, sequence: 2, timestamp_us: 3_000_000, payload: marker_payload)

    result = ExoFdr::Decoder.new(StringIO.new(binary)).call

    assert_equal %w[gps_pvt marker], result.records.map { |entry| entry.fetch("type") }
    assert_equal 1, result.stats.fetch("crc_errors")
    assert_equal 1, result.stats.fetch("sequence_gaps")
  end

  test "strict mode rejects a bad CRC and a truncated file records its tail" do
    damaged = valid_file.dup
    damaged.setbyte(damaged.length - 1, damaged.getbyte(damaged.length - 1) ^ 0xff)

    assert_raises(ExoFdr::Error) { ExoFdr::Decoder.new(StringIO.new(damaged), recover: false).call }

    truncated = valid_file.byteslice(0, valid_file.bytesize - 3)
    result = ExoFdr::Decoder.new(StringIO.new(truncated)).call
    assert_operator result.stats.fetch("partial_tail_bytes"), :>, 0
  end

  test "matches the Python reference decoder" do
    reference = Rails.root.join("..", "..", "fdr", "tools", "decode_fdr.py").expand_path
    skip "FDR Python reference is not available" unless reference.exist?

    Tempfile.create([ "exo-fdr-parity", ".bin" ]) do |file|
      file.binmode
      file.write(valid_file)
      file.flush
      stdout, stderr, status = Open3.capture3("python3", reference.to_s, "--format", "jsonl", file.path)
      assert status.success?, stderr
      python_records = stdout.lines.map { |line| JSON.parse(line) }
      ruby_records = ExoFdr::Decoder.new(StringIO.new(valid_file)).call.records

      assert_equal python_records, ruby_records
    end
  end

  private

  def valid_file
    @valid_file ||= file_header + [
      record(type: 1, sequence: 0, timestamp_us: 1_000_000, payload: gps_payload),
      record(type: 2, sequence: 1, timestamp_us: 1_100_000, payload: imu_payload),
      record(type: 3, sequence: 2, timestamp_us: 1_200_000, payload: airspeed_payload),
      record(type: 4, sequence: 3, timestamp_us: 1_300_000, payload: system_event_payload),
      record(type: 5, sequence: 4, timestamp_us: 1_400_000, payload: marker_payload)
    ].join
  end

  def file_header
    body = [ "EXOFDR1\0", 3, 64, 1_234, 777_000, "fdr-test", "" ].pack("a8vvVQ<a24a12")
    body + [ Zlib.crc32(body) ].pack("V")
  end

  def record(type:, sequence:, timestamp_us:, payload:)
    body = [ 0xA55A, 2, type, 28, payload.bytesize, 0, 0, sequence, timestamp_us ].pack("vCCvvvvVQ<")
    body + [ Zlib.crc32(body + payload) ].pack("V") + payload
  end

  def gps_payload
    [
      123_456, 2026, 7, 29, 10, 11, 12, 1, 80, 0, 3, 1, 0, 12,
      57_168_000, 441_994_000, 700_000, 642_000, 1_000, 1_500,
      20_000, 5_000, -1_000, 20_600, 3_600_000, 500, 10_000, 125
    ].pack("VvC6Vl<C4l<4V2l<5V2v")
  end

  def imu_payload
    [ 5, 3, 0, 0.98, 0.01, -0.04, 0.16 ].pack("CCve4")
  end

  def airspeed_payload
    [ "sensor-raw", 101_325.0, 1_730.0, 18.4, 53.2 ].pack("a11e4")
  end

  def system_event_payload
    [ 41, 1, "Pitot ready" ].pack("vCa48")
  end

  def marker_payload
    [ 73, 255, 190, 0 ].pack("VCCv")
  end
end
