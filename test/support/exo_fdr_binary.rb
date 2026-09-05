require "zlib"

module ExoFdrBinary
  def fdr_binary(records, boot_id: 1_234)
    header = [ "EXOFDR1\0", 3, 64, boot_id, 777_000, "fdr-test", "" ].pack("a8vvVQ<a24a12")
    header + [ Zlib.crc32(header) ].pack("V") + records.map do |record|
      payload = record.fetch(:payload) { [ record.fetch(:sequence), 255, 190, 0 ].pack("VCCv") }
      body = [ 0xA55A, 2, record.fetch(:type, 5), 28, payload.bytesize, 1, 0,
        record.fetch(:sequence), record.fetch(:timestamp_us) ].pack("vCCvvvvVQ<")
      body + [ Zlib.crc32(body + payload) ].pack("V") + payload
    end.join
  end

  def fdr_import(*binaries, device_id: "ECU-ABC123", **attributes)
    users(:julien).flight_imports.create!(
      source_filename: "FDR000001.BIN", import_type: "exofdr", status: "pending", device_id:, **attributes
    ).tap do |flight_import|
      binaries.each_with_index do |binary, index|
        flight_import.source_files.attach(io: StringIO.new(binary), filename: format("FDR%06d.BIN", index + 1), content_type: "application/octet-stream")
      end
    end
  end

  def recovery_fixture
    root = Pathname.new(ENV.fetch("EXOPTER_FDR_PATH", Rails.root.join("..", "fdr").to_s))
    JSON.parse(root.join("tests/fixtures/recovered_segments.json").read, symbolize_names: true)
  end
end
