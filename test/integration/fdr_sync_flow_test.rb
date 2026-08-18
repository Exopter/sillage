require "test_helper"
require "digest"
require "tempfile"
require "zlib"

class FdrSyncFlowTest < ActionDispatch::IntegrationTest
  setup { sign_in_as users(:julien) }

  test "stores, verifies and acknowledges an idempotent USB synchronized file" do
    asset = Assembly.create!(name: "Synchronized recorder")
    EmbeddedDevice.create!(assembly: asset, device_id: "EXOFDR-ABC123")
    Installation.create!(aircraft: aircraft(:pilatus), installable: asset, installed_at: 1.hour.ago)

    with_upload do |upload, binary|
      assert_enqueued_with(job: ExoFdrImportJob) do
        assert_difference -> { Current.user.flight_imports.count }, 1 do
          post api_v1_fdr_syncs_path,
            params: sync_params(upload, binary),
            headers: { "ACCEPT" => "application/json" }
        end
      end

      assert_response :created
      flight_import = Current.user.flight_imports.find(response.parsed_body.fetch("import_id"))
      assert_equal Digest::SHA256.hexdigest(binary), flight_import.source_sha256
      assert_equal "EXOFDR-ABC123", flight_import.device_id
      assert_equal aircraft(:pilatus), flight_import.aircraft
      assert_equal "usb_cdc", flight_import.details.dig("sync", "transport")
      assert flight_import.source_files.attached?

      duplicate_upload = Rack::Test::UploadedFile.new(
        upload.path,
        "application/octet-stream",
        true,
        original_filename: "FDR000001.BIN"
      )
      assert_no_enqueued_jobs only: ExoFdrImportJob do
        assert_no_difference -> { Current.user.flight_imports.count } do
          post api_v1_fdr_syncs_path,
            params: sync_params(duplicate_upload, binary),
            headers: { "ACCEPT" => "application/json" }
        end
      end
      assert_response :success
      assert_equal true, response.parsed_body.fetch("duplicate")
    end
  end

  test "rejects a file whose SHA-256 does not match its manifest" do
    with_upload do |upload, binary|
      params = sync_params(upload, binary).merge(sha256: "0" * 64)
      assert_no_difference -> { Current.user.flight_imports.count } do
        post api_v1_fdr_syncs_path,
          params:,
          headers: { "ACCEPT" => "application/json" }
      end
      assert_response :unprocessable_entity
      assert_includes response.parsed_body.fetch("error"), "SHA-256"
    end
  end

  test "acknowledges but does not import a synchronized file shorter than five seconds" do
    with_upload(duration_us: 4_999_999) do |upload, binary|
      assert_no_enqueued_jobs only: ExoFdrImportJob do
        assert_no_difference -> { Flight.count } do
          assert_no_difference -> { Current.user.flight_imports.count } do
            post api_v1_fdr_syncs_path,
              params: sync_params(upload, binary),
              headers: { "ACCEPT" => "application/json" }
          end
        end
      end

      assert_response :success
      assert_equal true, response.parsed_body.fetch("ignored")
      assert_in_delta 4.999999, response.parsed_body.fetch("duration_seconds")
      assert_equal Digest::SHA256.hexdigest(binary), response.parsed_body.fetch("sha256")
      assert_not response.parsed_body.key?("import_id")
    end
  end

  private

  def with_upload(duration_us: 5_000_000)
    binary = valid_file(duration_us:)
    Tempfile.create([ "FDR000001", ".BIN" ]) do |file|
      file.binmode
      file.write(binary)
      file.flush
      upload = Rack::Test::UploadedFile.new(
        file.path,
        "application/octet-stream",
        true,
        original_filename: "FDR000001.BIN"
      )
      yield upload, binary
    end
  end

  def sync_params(upload, binary)
    {
      source_file: upload,
      device_id: "EXOFDR-ABC123",
      filename: "FDR000001.BIN",
      file_index: 1,
      boot_id: 1_234,
      format_version: 3,
      size_bytes: binary.bytesize,
      sha256: Digest::SHA256.hexdigest(binary)
    }
  end

  def valid_file(duration_us:)
    header_body = [ "EXOFDR1\0", 3, 64, 1_234, 777_000, "fdr-test", "" ].pack("a8vvVQ<a24a12")
    header = header_body + [ Zlib.crc32(header_body) ].pack("V")
    payload = [ 40, 6, "Storage ready" ].pack("vCa48")
    first_record = record(payload:, sequence: 0, timestamp_us: 1_000_000)
    last_record = record(payload:, sequence: 1, timestamp_us: 1_000_000 + duration_us)
    header + first_record + last_record
  end

  def record(payload:, sequence:, timestamp_us:)
    body = [ 0xA55A, 2, 4, 28, payload.bytesize, 1, 0, sequence, timestamp_us ].pack("vCCvvvvVQ<")
    body + [ Zlib.crc32(body + payload) ].pack("V") + payload
  end
end
