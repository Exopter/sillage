require "test_helper"
require "digest"
require "tempfile"
require "zlib"
require_relative "../support/method_replacement"

class FdrSyncFlowTest < ActionDispatch::IntegrationTest
  include MethodReplacement
  setup { sign_in_as users(:julien) }

  test "validates USB metadata above the former 512 MiB file limit while enforcing manifest size" do
    with_upload do |upload, binary|
      metadata = sync_params(upload, binary).merge(size_bytes: 513.megabytes)
      replace_method(upload, :size, -> { 513.megabytes }) do
        service = FdrSync::Ingest.new(user: users(:julien), upload:, metadata:)
        assert_nothing_raised { service.send(:validate_metadata!) }

        mismatched = FdrSync::Ingest.new(user: users(:julien), upload:, metadata: metadata.merge(size_bytes: 514.megabytes))
        error = assert_raises(FdrSync::Error) { mismatched.send(:validate_metadata!) }
        assert_includes error.message, "size does not match the manifest"
      end
    end
  end

  test "stores, verifies and acknowledges an idempotent USB synchronized file" do
    asset = Assembly.create!(name: "Synchronized recorder")
    create_embedded_controller(assembly: asset, device_id: "ECU-ABC123")
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
      assert_equal "ECU-ABC123", flight_import.device_id
      assert_nil flight_import.aircraft
      assert_equal "pending", response.parsed_body.fetch("import_status")
      assert_equal "usb_cdc", flight_import.details.dig("sync", "transport")
      assert flight_import.source_files.attached?

      duplicate_upload = Rack::Test::UploadedFile.new(
        upload.path,
        "application/octet-stream",
        true,
        original_filename: "FDR000001.BIN"
      )
      assert_enqueued_jobs 1, only: ExoFdrImportJob do
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

  test "an enqueue failure rolls back the receipt and a retry schedules a complete source" do
    with_upload do |upload, binary|
      [ ->(*) { raise ActiveJob::EnqueueError, "queue unavailable" }, ->(*) { false } ].each do |failure|
        replace_method(ExoFdrImportJob, :perform_later, failure) do
          assert_no_difference -> { FlightImport.count } do
            assert_raises(ActiveJob::EnqueueError) do
              FdrSync::Ingest.new(user: users(:julien), upload:, metadata: sync_params(upload, binary)).call
            end
          end
        end
      end
      assert_enqueued_jobs 1, only: ExoFdrImportJob do
        result = FdrSync::Ingest.new(user: users(:julien), upload:, metadata: sync_params(upload, binary)).call
        assert_equal binary, result.flight_import.source_files.first.download
      end
    end
  end

  test "completed imports are acknowledged without another processing job" do
    with_upload do |upload, binary|
      service = FdrSync::Ingest.new(user: users(:julien), upload:, metadata: sync_params(upload, binary))
      result = service.call
      ExoFdr::ImportService.new(result.flight_import).call
      assert_no_enqueued_jobs only: ExoFdrImportJob do
        assert service.call.duplicate
      end
    end
  end

  test "Solid Queue scheduling shares the receipt transaction" do
    original_adapter = ExoFdrImportJob.queue_adapter
    ExoFdrImportJob.queue_adapter = :solid_queue
    with_upload do |upload, binary|
      assert_no_difference [ -> { FlightImport.count }, -> { SolidQueue::Job.count } ] do
        FlightImport.transaction(requires_new: true) do
          result = FdrSync::Ingest.new(user: users(:julien), upload:, metadata: sync_params(upload, binary)).call
          assert SolidQueue::Job.where(class_name: "ExoFdrImportJob").exists?
          assert_equal binary, result.flight_import.source_files.first.download
          @rolled_back_blob = result.flight_import.source_files.first.blob
          raise ActiveRecord::Rollback
        end
      end
      assert_not @rolled_back_blob.service.exist?(@rolled_back_blob.key)
    end
  ensure
    ExoFdrImportJob.queue_adapter = original_adapter
  end

  test "validates short files in the queue and retains the original before acknowledging" do
    with_upload(duration_us: 4_999_999) do |upload, binary|
      assert_enqueued_jobs 1, only: ExoFdrImportJob do
        post api_v1_fdr_syncs_path, params: sync_params(upload, binary), headers: { "ACCEPT" => "application/json" }
      end
      assert_response :created
      status_url = response.parsed_body.fetch("status_url")
      import = Current.user.flight_imports.find(response.parsed_body.fetch("import_id"))
      assert_no_difference -> { Flight.count } do
        ExoFdr::ImportService.new(import).call
      end
      get status_url
      assert_response :success
      assert_equal "imported", response.parsed_body.fetch("import_status")
      assert_equal true, response.parsed_body.fetch("ignored")
      assert_in_delta 4.999999, import.reload.details.fetch("duration_seconds")
      assert_equal binary, import.source_files.first.download
      assert_equal Digest::SHA256.hexdigest(binary), response.parsed_body.fetch("sha256")
    end
  end

  test "the request reads only the header and the queue rejects corrupt or truncated records" do
    with_upload do |upload, binary|
      [ binary.byteslice(0...-1), binary.dup.tap { |data| data.setbyte(-1, data.getbyte(-1) ^ 255) } ].each do |damaged|
        File.binwrite(upload.path, damaged)
        source = Rack::Test::UploadedFile.new(upload.path, "application/octet-stream", true, original_filename: "FDR000001.BIN")
        header_only_decoder = lambda do |io, **options|
          ExoFdr::Decoder.allocate.tap do |decoder|
            decoder.send(:initialize, io, **options)
            decoder.define_singleton_method(:each_record) { raise "record decode in web request" }
          end
        end
        replace_method(ExoFdr::Decoder, :new, header_only_decoder) do
          post api_v1_fdr_syncs_path, params: sync_params(source, damaged), headers: { "ACCEPT" => "application/json" }
        end
        assert_response :created
        status_url = response.parsed_body.fetch("status_url")
        import = Current.user.flight_imports.find(response.parsed_body.fetch("import_id"))
        assert_no_difference -> { Flight.count } do
          assert_raises(ExoFdr::Error) { ExoFdr::ImportService.new(import).call }
        end
        get status_url
        assert_equal "failed", response.parsed_body.fetch("import_status")
        assert response.parsed_body.fetch("error").present?
        assert_equal damaged, import.source_files.first.download
      end
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
      device_id: "ECU-ABC123",
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
