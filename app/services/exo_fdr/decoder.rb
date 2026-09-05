require "zlib"

module ExoFdr
  class Decoder
    FILE_HEADER_SIZE = 64
    RECORD_HEADER_SIZE = 28
    MAGIC = "EXOFDR1\0".b
    SYNC_BYTES = [ 0xA55A ].pack("v")
    SUPPORTED_FORMAT_VERSIONS = [ 1, 2, 3 ].freeze
    RECORD_NAMES = {
      1 => "gps_pvt",
      2 => "imu",
      3 => "airspeed",
      4 => "system_event",
      5 => "marker"
    }.freeze
    IMU_NAMES = {
      0x01 => "accelerometer",
      0x02 => "gyroscope_calibrated",
      0x03 => "magnetic_field_calibrated",
      0x05 => "rotation_vector"
    }.freeze

    Result = Data.define(:header, :records, :stats)

    READ_CHUNK_SIZE = 64 * 1024
    attr_reader :header, :stats

    def initialize(io, recover: true, source_file: nil, seen_sequences: nil, next_sequence_by_boot: nil, on_record: nil)
      @io, @recover, @source_file, @on_record = io, recover, source_file, on_record
      @seen_sequences, @next_sequence_by_boot = seen_sequences, next_sequence_by_boot
      @stats = {
        "records" => 0, "crc_errors" => 0, "malformed_headers" => 0,
        "skipped_bytes" => 0, "partial_tail_bytes" => 0, "sequence_gaps" => 0,
        "duplicate_records" => 0, "records_by_type" => Hash.new(0)
      }
      @header = decode_file_header
    end

    # Convenience for small callers; production imports consume each_record in batches.
    def call
      Result.new(header:, records: each_record.to_a, stats:)
    end

    def each_record
      return enum_for(__method__) unless block_given?

      data = +"".b
      offset = FILE_HEADER_SIZE
      eof = false
      expected_sequence = nil
      fill = lambda do |minimum|
        while data.bytesize < minimum && !eof
          chunk = @io.read(READ_CHUNK_SIZE)
          chunk && !chunk.empty? ? data << chunk.b : eof = true
        end
      end
      discard = lambda do |count|
        data = data.byteslice(count..) || +"".b
        offset += count
      end
      loop do
        fill.call(2)
        if data.bytesize < 2
          @stats["partial_tail_bytes"] += data.bytesize
          break
        end
        sync_offset = data.index(SYNC_BYTES)
        unless sync_offset
          if eof
            @stats["skipped_bytes"] += data.bytesize
            break
          end
          count = data.bytesize - (data.getbyte(-1) == SYNC_BYTES.getbyte(0) ? 1 : 0)
          @stats["skipped_bytes"] += count
          discard.call(count)
          next
        end
        @stats["skipped_bytes"] += sync_offset
        discard.call(sync_offset) if sync_offset.positive?
        fill.call(RECORD_HEADER_SIZE)
        if data.bytesize < RECORD_HEADER_SIZE
          @stats["partial_tail_bytes"] += data.bytesize
          break
        end
        raw_header = data.byteslice(0, RECORD_HEADER_SIZE)
        sync, version, type, header_size, payload_size, flags, _reserved, sequence, timestamp_us, stored_crc =
          raw_header.unpack("vCCvvvvVQ<V")
        sane = sync == 0xA55A && version.in?([ 1, 2 ]) && header_size == RECORD_HEADER_SIZE && payload_size <= 96
        unless sane
          @stats["malformed_headers"] += 1
          raise Error, "Malformed ExoFDR record header at byte #{offset}." unless @recover

          discard.call(1)
          next
        end
        record_size = header_size + payload_size
        fill.call(record_size)
        if data.bytesize < record_size
          @stats["partial_tail_bytes"] += data.bytesize
          break
        end
        payload = data.byteslice(header_size, payload_size)
        unless Zlib.crc32(raw_header.byteslice(0, RECORD_HEADER_SIZE - 4) + payload) == stored_crc
          @stats["crc_errors"] += 1
          raise Error, "ExoFDR record CRC mismatch at byte #{offset}." unless @recover

          discard.call(1)
          next
        end
        record = {
          "boot_id" => header.fetch("boot_id"), "source_file" => @source_file,
          "sequence" => sequence, "timestamp_us" => timestamp_us,
          "time_s" => timestamp_us / 1_000_000.0, "type_id" => type,
          "type" => RECORD_NAMES.fetch(type, "unknown_#{type}"), "record_flags" => flags
        }.merge(decode_payload(type, payload))
        @on_record&.call(record)
        if @seen_sequences && !@seen_sequences[header.fetch("boot_id")].add?(sequence)
          @stats["duplicate_records"] += 1
          discard.call(record_size)
          next
        end
        expected_sequence = @next_sequence_by_boot[header.fetch("boot_id")] if @next_sequence_by_boot
        @stats["sequence_gaps"] += (sequence - expected_sequence) & 0xffffffff if expected_sequence && sequence != expected_sequence
        expected_sequence = (sequence + 1) & 0xffffffff
        @next_sequence_by_boot[header.fetch("boot_id")] = expected_sequence if @next_sequence_by_boot
        record_name = RECORD_NAMES.fetch(type, "unknown_#{type}")
        @stats["records"] += 1
        @stats["records_by_type"][record_name] += 1
        yield record
        discard.call(record_size)
      end
    end

    private

    def decode_file_header
      raw = @io.read(FILE_HEADER_SIZE)
      raise Error, "File is too short for an ExoFDR header." unless raw&.bytesize == FILE_HEADER_SIZE

      magic, version, header_size, boot_id, boot_us, firmware, _reserved, stored_crc =
        raw.unpack("a8vvVQ<a24a12V")
      raise Error, "Unexpected ExoFDR file signature." unless magic == MAGIC
      raise Error, "Unsupported ExoFDR format version #{version}." unless version.in?(SUPPORTED_FORMAT_VERSIONS)
      raise Error, "Unsupported ExoFDR header size #{header_size}." unless header_size == FILE_HEADER_SIZE
      raise Error, "ExoFDR file header CRC mismatch." unless Zlib.crc32(raw.byteslice(0, FILE_HEADER_SIZE - 4)) == stored_crc

      { "format_version" => version, "boot_id" => boot_id,
        "boot_monotonic_us" => boot_us, "firmware" => decode_string(firmware) }
    end

    def decode_payload(type, payload)
      case type
      when 1 then decode_gps(payload)
      when 2 then decode_imu(payload)
      when 3 then decode_airspeed(payload)
      when 4 then decode_system_event(payload)
      when 5 then decode_marker(payload)
      else { "raw_hex" => payload.unpack1("H*"), "payload_size" => payload.bytesize }
      end
    end

    def decode_gps(payload)
      return raw_payload(payload) unless payload.bytesize == 78

      values = payload.unpack("VvC6Vl<C4l<4V2l<5V2v")
      keys = %w[
        itow_ms year month day hour minute second utc_valid time_accuracy_ns nano_seconds
        fix_type gps_flags gps_flags2 satellites longitude_deg_e7 latitude_deg_e7
        height_ellipsoid_mm height_msl_mm horizontal_accuracy_mm vertical_accuracy_mm
        velocity_north_mm_s velocity_east_mm_s velocity_down_mm_s ground_speed_mm_s
        heading_motion_deg_e5 speed_accuracy_mm_s heading_accuracy_deg_e5 position_dop_centi
      ]
      keys.zip(values).to_h
    end

    def decode_imu(payload)
      return raw_payload(payload) unless payload.bytesize == 20

      sensor_id, accuracy, _reserved, x, y, z, w = payload.unpack("CCve4")
      {
        "sensor_id" => sensor_id,
        "sensor" => IMU_NAMES.fetch(sensor_id, "unknown_#{sensor_id}"),
        "accuracy" => accuracy,
        "x" => x,
        "y" => y,
        "z" => z,
        "w" => w
      }
    end

    def decode_airspeed(payload)
      return raw_payload(payload) unless payload.bytesize.in?([ 23, 27 ])

      raw_size = payload.bytesize == 27 ? 11 : 7
      raw, pressure, differential, temperature, airspeed = payload.unpack("a#{raw_size}e4")
      {
        "raw_hex" => raw.unpack1("H*"),
        "sensor_pressure_pa" => pressure,
        "differential_pressure_pa" => differential,
        "temperature_c" => temperature,
        "airspeed_m_s" => airspeed
      }
    end

    def decode_system_event(payload)
      return raw_payload(payload) unless payload.bytesize == 51

      code, severity, text = payload.unpack("vCa48")
      { "code" => code, "severity" => severity, "text" => decode_string(text) }
    end

    def decode_marker(payload)
      return raw_payload(payload) unless payload.bytesize == 8

      marker_id, source_system, source_component, _reserved = payload.unpack("VCCv")
      { "marker_id" => marker_id, "source_system" => source_system, "source_component" => source_component }
    end

    def raw_payload(payload)
      { "raw_hex" => payload.unpack1("H*"), "payload_size" => payload.bytesize }
    end

    def decode_string(value)
      value.split("\0", 2).first.to_s.force_encoding(Encoding::UTF_8).scrub
    end
  end
end
