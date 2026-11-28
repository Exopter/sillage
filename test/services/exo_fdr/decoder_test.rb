require "test_helper"
require "json"
require "open3"
require "stringio"
require "tempfile"
require "zlib"

class ExoFdr::DecoderTest < ActiveSupport::TestCase
  test "identifies native body and unknown IMU frames without rotating stored values" do
    { 0 => "sensor_native", 1 => "body_frd_ned", 99 => "unknown_99" }.each do |frame_id, frame_name|
      payload = [ 5, 3, frame_id, -0.4, 0.2, -0.4, 0.8 ].pack("CCve4")
      binary = file_header + record(type: 2, sequence: 0, timestamp_us: 1_000_000, payload:)
      sample = ExoFdr::Decoder.new(StringIO.new(binary)).call.records.sole
      assert_equal frame_id, sample.fetch("frame_id")
      assert_equal frame_name, sample.fetch("coordinate_frame")
      %w[x y z w].zip([ -0.4, 0.2, -0.4, 0.8 ]).each { |axis, value| assert_in_delta value, sample.fetch(axis), 1e-6 }
    end
  end

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

  test "reads a distributed recording on the Seat timeline and keeps each module identified" do
    seat, central, airspeed = 0x0000C8BE85F61B44, 0x000050233AD9B4DC, 0x0000748583F61B44
    envelope = lambda do |role, device, boot, sequence, timestamp, kind, payload|
      [ 0xD1F1, 1, role, device, boot, sequence, timestamp, 1, kind, payload.bytesize ].pack("vCCQ<VVQ<vCC") + payload
    end
    # Central runs 4.0 s ahead of Seat: sent at 10.000 s, stamped 14.001 s, answered 14.002 s, received 10.004 s.
    clock = [ 0xC1F1, 1, 3, 1_234, central, 7, 0, 10_000_000, 14_001_000, 14_002_000 ].pack("vCCVQ<VVQ<3")
    binary = file_header +
      record(type: 32, sequence: 0, timestamp_us: 9_000_000, payload: envelope.call(1, seat, 1_234, 0, 9_000_000, 1, gps_payload)) +
      record(type: 32, sequence: 1, timestamp_us: 13_500_000, payload: envelope.call(2, central, 7, 40, 13_500_000, 2, imu_payload)) +
      record(type: 33, sequence: 2, timestamp_us: 10_004_000, payload: clock) +
      record(type: 32, sequence: 3, timestamp_us: 14_500_000, payload: envelope.call(2, central, 7, 41, 14_500_000, 2, imu_payload)) +
      record(type: 32, sequence: 4, timestamp_us: 14_500_000, payload: envelope.call(2, central, 7, 41, 14_500_000, 2, imu_payload)) +
      record(type: 32, sequence: 5, timestamp_us: 3_000_000, payload: envelope.call(3, airspeed, 9, 5, 3_000_000, 3, airspeed_payload)) +
      record(type: 32, sequence: 6, timestamp_us: 1, payload: "broken".b)
    result = ExoFdr::Decoder.new(StringIO.new(binary)).call

    assert_equal %w[gps_pvt distributed_clock imu imu], result.records.map { |row| row.fetch("type") }
    position, _clock, held, live = result.records
    assert_equal [ "seat", "ECU-441BF685BEC8", 9_000_000 ], position.values_at("source_role", "source_device_id", "timestamp_us")
    assert_in_delta 44.1994, position.fetch("latitude_deg_e7") / 1e7
    # The observation that arrived before the first clock exchange is placed once the exchange is known.
    assert_equal [ "central", "ECU-DCB4D93A2350", 40, 13_500_000 ], held.values_at("source_role", "source_device_id", "source_sequence", "source_timestamp_us")
    assert_equal 13_500_000 - 3_999_500, held.fetch("timestamp_us")
    assert_equal 14_500_000 - 3_999_500, live.fetch("timestamp_us")
    assert_equal 1_500, live.fetch("clock_uncertainty_us")
    assert_equal "rotation_vector", live.fetch("sensor")
    # The replayed copy is dropped, the leaf with no clock exchange is reported, the broken envelope is counted.
    assert_equal 1, result.stats.fetch("duplicate_records")
    assert_equal 1, result.stats.fetch("unaligned_records")
    assert_equal 1, result.stats.fetch("malformed_headers")
    assert_equal 0, result.stats.fetch("sequence_gaps")
  end

  test "decodes static pressure directly and inside a distributed envelope" do
    seat, airspeed = 0x0000C8BE85F61B44, 0x0000748583F61B44
    payload = [ [ "408b8e22739ce7" ].pack("H*"), 80_642.0, 25.0 ].pack("a7e2")
    envelope = lambda do |role, device, sequence, kind, body|
      [ 0xD1F1, 1, role, device, 1_234, sequence, 2_000_000, 1, kind, body.bytesize ].pack("vCCQ<VVQ<vCC") + body
    end
    binary = file_header +
      record(type: 15, sequence: 0, timestamp_us: 1_000_000, payload:) +
      record(type: 15, sequence: 1, timestamp_us: 1_100_000, payload: payload.byteslice(0, 14)) +
      record(type: 32, sequence: 2, timestamp_us: 2_000_000, payload: envelope.call(1, seat, 0, 15, payload)) +
      # Lite record types are not valid distributed observations.
      record(type: 32, sequence: 3, timestamp_us: 2_100_000, payload: envelope.call(3, airspeed, 0, 7, payload))
    result = ExoFdr::Decoder.new(StringIO.new(binary)).call

    assert_equal %w[static_pressure static_pressure static_pressure], result.records.map { |row| row.fetch("type") }
    direct, truncated, wrapped = result.records
    assert_equal "408b8e22739ce7", direct.fetch("raw_hex")
    assert_in_delta 80_642.0, direct.fetch("static_pressure_pa")
    assert_in_delta 25.0, direct.fetch("temperature_c")
    assert_equal 14, truncated.fetch("payload_size")
    assert_not truncated.key?("static_pressure_pa")
    assert_equal [ "seat", 15 ], wrapped.values_at("source_role", "type_id")
    assert_in_delta 80_642.0, wrapped.fetch("static_pressure_pa")
    assert_equal 1, result.stats.fetch("malformed_headers")
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

  test "matches the shared Python corpus including provenance and recovery" do
    root = Pathname.new(ENV.fetch("EXOPTER_FDR_PATH", Rails.root.join("..", "flight-data-recorder").to_s)).expand_path
    reference = root.join("tools/decode_fdr.py")
    assert reference.exist?, "FDR Python reference is required; set EXOPTER_FDR_PATH."
    fixture = root.join("tests/fixtures/decoder_parity.json")
    assert fixture.exist?, "The shared decoder parity corpus is required."

    JSON.parse(fixture.read).fetch("cases").each do |scenario|
      Dir.mktmpdir("decoder-parity") do |directory|
        paths = scenario.fetch("files").map do |file|
          File.join(directory, file.fetch("name")).tap { |path| File.binwrite(path, [ file.fetch("hex") ].pack("H*")) }
        end
        stdout, stderr, status = Open3.capture3("python3", reference.to_s, "--format", "jsonl", *paths)
        if scenario["header_error"]
          assert_equal 1, status.exitstatus
          assert_match(/unsupported FDR format version/, stderr)
          error = assert_raises(ExoFdr::Error) { File.open(paths.first, "rb") { |io| ExoFdr::Decoder.new(io) } }
          assert_match(/Unsupported ExoFDR format version/, error.message)
          next
        end
        assert_includes [ 0, 2 ], status.exitstatus, stderr
        summary = JSON.parse(stderr)
        seen = Hash.new { |sets, boot_id| sets[boot_id] = Set.new }
        next_sequences = {}
        ruby_records = []
        ruby_headers = []
        recovery = Hash.new(0)
        types = Hash.new(0)
        paths.each do |path|
          File.open(path, "rb") do |io|
            result = ExoFdr::Decoder.new(io, source_file: path, seen_sequences: seen, next_sequence_by_boot: next_sequences).call
            ruby_headers << result.header.merge("source_file" => path)
            ruby_records.concat(result.records)
            result.stats.each do |key, value|
              key == "records_by_type" ? value.each { |type, count| types[type] += count } : recovery[key] += value
            end
          end
        end
        assert_equal stdout.lines.map { |line| JSON.parse(line) }, ruby_records, scenario.fetch("name")
        assert_equal summary.fetch("file_headers"), ruby_headers
        assert_equal scenario.fetch("sequences"), ruby_records.map { |record| record.fetch("sequence") }
        assert_equal scenario.fetch("recovery"), recovery
        assert_equal summary.fetch("recovery").slice(*recovery.keys), recovery
        assert_equal summary.dig("recovery", "records_by_type"), types
        if scenario.fetch("strict_error")
          _out, _err, strict_status = Open3.capture3("python3", reference.to_s, "--strict", *paths)
          assert_equal 1, strict_status.exitstatus
          assert_raises(ExoFdr::Error) { File.open(paths.first, "rb") { |io| ExoFdr::Decoder.new(io, recover: false).each_record { |_| } } }
        end
      end
    end
  end

  test "streams bounded reads and recovers a sync marker across chunk boundaries" do
    binary = file_header + ("x" * (ExoFdr::Decoder::READ_CHUNK_SIZE - 1)) + record(type: 5, sequence: 0, timestamp_us: 1, payload: marker_payload)
    io = StringIO.new(binary)
    reads = []
    original = io.method(:read)
    io.define_singleton_method(:read) do |length|
      raise "unbounded read" unless length && length <= ExoFdr::Decoder::READ_CHUNK_SIZE

      reads << length
      original.call(length)
    end
    decoder = ExoFdr::Decoder.new(io)
    assert_equal [ 0 ], decoder.each_record.map { |record| record.fetch("sequence") }
    assert_equal ExoFdr::Decoder::READ_CHUNK_SIZE - 1, decoder.stats.fetch("skipped_bytes")
    assert_operator reads.size, :>, 2
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
