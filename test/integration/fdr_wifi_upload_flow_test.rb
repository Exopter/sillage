require "test_helper"
require "digest"
require "fileutils"
require "openssl"
require "zlib"
require_relative "../support/method_replacement"

class FdrWifiUploadFlowTest < ActionDispatch::IntegrationTest
  include MethodReplacement
  SIGNATURE_DOMAIN = "exopter/fdr/wifi-upload/v1\0".b

  setup do
    @asset = Assembly.create!(name: "Wi-Fi upload recorder")
    @recorder = create_embedded_controller(assembly: @asset, device_id: "ECU-A172E0")
    @key = @recorder.ensure_fdr_auth_key!
    Installation.create!(aircraft: aircraft(:pilatus), installable: @asset, installed_at: 1.hour.ago)
    @binary = valid_file
    @manifest = {
      filename: "FDR000001.BIN",
      file_index: 1,
      boot_id: 4_110_214_648,
      format_version: 3,
      size_bytes: @binary.bytesize,
      sha256: Digest::SHA256.hexdigest(@binary)
    }
  end

  teardown do
    FdrWifiUpload.where(embedded_controller: @recorder).find_each do |upload|
      FileUtils.rm_f(upload.staged_path)
    end
  end

  test "accepts a signed manifest above the former 512 MiB file limit" do
    body = @manifest.merge(size_bytes: 513.megabytes).to_json
    post api_v1_fdr_wifi_uploads_path,
      params: body,
      headers: signed_headers(body, "create", content_type: "application/json")

    assert_response :created
    upload = FdrWifiUpload.find_by!(token: response.headers.fetch("X-FDR-Upload-Token"))
    assert_equal 513.megabytes, upload.size_bytes
    assert_equal 0, upload.received_bytes
    assert_equal "receiving", upload.status
  end

  test "recorder resumes, verifies and imports a signed Wi-Fi upload without a browser session" do
    manifest_body = @manifest.to_json
    post api_v1_fdr_wifi_uploads_path,
      params: manifest_body,
      headers: signed_headers(manifest_body, "create", content_type: "application/json")

    assert_response :created
    token = response.headers.fetch("X-FDR-Upload-Token")
    assert_equal "0", response.headers.fetch("X-FDR-Upload-Offset")
    assert_equal "receiving", response.headers.fetch("X-FDR-Upload-Status")

    midpoint = @binary.bytesize / 2
    first = @binary.byteslice(0, midpoint)
    second = @binary.byteslice(midpoint, @binary.bytesize - midpoint)
    patch chunk_api_v1_fdr_wifi_upload_path(token),
      params: first,
      headers: signed_headers(first, "chunk:#{token}:0", offset: 0)
    assert_response :success
    assert_equal first.bytesize.to_s, response.headers.fetch("X-FDR-Upload-Offset")

    patch chunk_api_v1_fdr_wifi_upload_path(token),
      params: first,
      headers: signed_headers(first, "chunk:#{token}:0", offset: 0)
    assert_response :success
    assert_equal first.bytesize.to_s, response.headers.fetch("X-FDR-Upload-Offset")

    post api_v1_fdr_wifi_uploads_path,
      params: manifest_body,
      headers: signed_headers(manifest_body, "create", content_type: "application/json")
    assert_response :success
    assert_equal first.bytesize.to_s, response.headers.fetch("X-FDR-Upload-Offset")

    patch chunk_api_v1_fdr_wifi_upload_path(token),
      params: second,
      headers: signed_headers(second, "chunk:#{token}:#{first.bytesize}", offset: first.bytesize)
    assert_response :success
    assert_equal @binary.bytesize.to_s, response.headers.fetch("X-FDR-Upload-Offset")

    assert_no_enqueued_jobs only: ExoFdrImportJob do
      perform_enqueued_jobs only: FdrWifiUploadFinalizeJob do
        post complete_api_v1_fdr_wifi_upload_path(token),
          params: "",
          headers: signed_headers("", "complete:#{token}")
        assert_response :success
      end
    end

    upload = FdrWifiUpload.find_by!(token:)
    assert_equal "complete", upload.status
    assert_equal "imported", upload.flight_import.status
    assert_equal 4_110_214_648, upload.boot_id
    assert_equal @binary.bytesize, upload.received_bytes
    assert_not File.exist?(upload.staged_path)
    assert_equal "wifi_https", upload.flight_import.details.dig("sync", "transport")
    assert_equal @recorder.device_id, upload.flight_import.device_id
    assert upload.flight_import.source_files.attached?

    post api_v1_fdr_wifi_uploads_path,
      params: manifest_body,
      headers: signed_headers(manifest_body, "create", content_type: "application/json")
    assert_response :success
    assert_equal "complete", response.headers.fetch("X-FDR-Upload-Status")
  end

  test "rejects unsigned, cross-domain and out-of-order chunks" do
    manifest_body = @manifest.to_json
    post api_v1_fdr_wifi_uploads_path, params: manifest_body, headers: { "CONTENT_TYPE" => "application/json" }
    assert_response :unauthorized

    sent_at = Time.current.to_i
    heartbeat_signature = OpenSSL::HMAC.hexdigest(
      "SHA256",
      @key,
      "exopter/fdr/sillage-heartbeat/v1\0".b + canonical(manifest_body, "create", sent_at)
    )
    post api_v1_fdr_wifi_uploads_path,
      params: manifest_body,
      headers: signed_headers(manifest_body, "create", sent_at:, signature: heartbeat_signature, content_type: "application/json")
    assert_response :unauthorized

    post api_v1_fdr_wifi_uploads_path,
      params: manifest_body,
      headers: signed_headers(manifest_body, "create", content_type: "application/json")
    token = response.headers.fetch("X-FDR-Upload-Token")
    chunk = @binary.byteslice(0, 32)
    patch chunk_api_v1_fdr_wifi_upload_path(token),
      params: chunk,
      headers: signed_headers(chunk, "chunk:#{token}:12", offset: 12)
    assert_response :conflict
    assert_equal "0", response.headers.fetch("X-FDR-Upload-Offset")

    patch chunk_api_v1_fdr_wifi_upload_path(token),
      params: chunk,
      headers: signed_headers(chunk, "chunk:#{token}:0", offset: 12)
    assert_response :unauthorized
  end

  test "accepts 256 KiB performance chunks and rejects larger request bodies" do
    oversized = "x".b * (Api::V1::FdrWifiUploadsController::MAX_CHUNK_BYTES + 1)
    manifest_body = @manifest.merge(
      file_index: 2,
      size_bytes: oversized.bytesize,
      sha256: Digest::SHA256.hexdigest(oversized)
    ).to_json
    post api_v1_fdr_wifi_uploads_path,
      params: manifest_body,
      headers: signed_headers(manifest_body, "create", content_type: "application/json")
    assert_response :created
    token = response.headers.fetch("X-FDR-Upload-Token")

    patch chunk_api_v1_fdr_wifi_upload_path(token),
      params: oversized,
      headers: signed_headers(oversized, "chunk:#{token}:0", offset: 0)
    assert_response :content_too_large

    chunk = oversized.byteslice(0, Api::V1::FdrWifiUploadsController::MAX_CHUNK_BYTES)
    patch chunk_api_v1_fdr_wifi_upload_path(token),
      params: chunk,
      headers: signed_headers(chunk, "chunk:#{token}:0", offset: 0)
    assert_response :success
    assert_equal chunk.bytesize.to_s, response.headers.fetch("X-FDR-Upload-Offset")
  end

  test "accepts the legacy controller prefix during the firmware transition" do
    manifest_body = @manifest.to_json
    legacy_device_id = "EXOFDR-A172E0"

    post api_v1_fdr_wifi_uploads_path,
      params: manifest_body,
      headers: signed_headers(manifest_body, "create", device_id: legacy_device_id, content_type: "application/json")

    assert_response :created
    assert_equal @recorder, FdrWifiUpload.find_by!(token: response.headers.fetch("X-FDR-Upload-Token")).embedded_controller
  end

  test "keeps a staged recording unacknowledged when final SHA verification fails" do
    manifest = @manifest.merge(sha256: "0" * 64)
    manifest_body = manifest.to_json
    post api_v1_fdr_wifi_uploads_path,
      params: manifest_body,
      headers: signed_headers(manifest_body, "create", content_type: "application/json")
    token = response.headers.fetch("X-FDR-Upload-Token")

    patch chunk_api_v1_fdr_wifi_upload_path(token),
      params: @binary,
      headers: signed_headers(@binary, "chunk:#{token}:0", offset: 0)
    assert_response :success

    perform_enqueued_jobs only: FdrWifiUploadFinalizeJob do
      post complete_api_v1_fdr_wifi_upload_path(token),
        params: "",
        headers: signed_headers("", "complete:#{token}")
    end

    upload = FdrWifiUpload.find_by!(token:)
    assert_equal "failed", upload.status
    assert_match(/declared SHA-256/, upload.error_message)
    assert File.exist?(upload.staged_path)
    assert_nil upload.flight_import
  end

  test "transient verification failures remain resumable after retries are exhausted" do
    upload = @recorder.fdr_wifi_uploads.create!(@manifest)
    upload.append_chunk!(offset: 0, bytes: @binary)
    upload.begin_verification!
    failing_ingest = Object.new
    failing_ingest.define_singleton_method(:call) { raise IOError, "Temporary storage failure" }
    replace_method(FdrSync::Ingest, :new, ->(**) { failing_ingest }) do
      job = FdrWifiUploadFinalizeJob.new(upload)
      job.executions = FdrWifiUploadFinalizeJob::MAX_ATTEMPTS
      job.perform_now
    end
    assert_equal "retryable", upload.reload.status
    assert File.exist?(upload.staged_path)
    body = @manifest.to_json
    post api_v1_fdr_wifi_uploads_path, params: body, headers: signed_headers(body, "create", content_type: "application/json")
    assert_response :success
    assert_equal "retryable", response.headers.fetch("X-FDR-Upload-Status")
    upload.update_columns(updated_at: 6.minutes.ago)
    post api_v1_fdr_wifi_uploads_path, params: body, headers: signed_headers(body, "create", content_type: "application/json")
    assert_equal "receiving", response.headers.fetch("X-FDR-Upload-Status")
    assert_equal @binary.bytesize.to_s, response.headers.fetch("X-FDR-Upload-Offset")
    upload.reload.begin_verification!
    FdrWifiUploadFinalizeJob.perform_now(upload)
    assert_equal "complete", upload.reload.status
    assert upload.flight_import.source_files.attached?
  end

  test "a missing verification job is rescheduled on manifest polling" do
    upload = @recorder.fdr_wifi_uploads.create!(@manifest)
    upload.append_chunk!(offset: 0, bytes: @binary)
    upload.update!(status: "verifying", updated_at: 6.minutes.ago)
    body = @manifest.to_json
    assert_enqueued_jobs 1, only: FdrWifiUploadFinalizeJob do
      post api_v1_fdr_wifi_uploads_path, params: body, headers: signed_headers(body, "create", content_type: "application/json")
    end
    assert_equal "verifying", response.headers.fetch("X-FDR-Upload-Status")
  end

  test "an enqueue error cannot strand an upload in verifying" do
    upload = @recorder.fdr_wifi_uploads.create!(@manifest)
    upload.append_chunk!(offset: 0, bytes: @binary)
    replace_method(FdrWifiUploadFinalizeJob, :perform_later, ->(*) { false }) do
      assert_raises(ActiveJob::EnqueueError) { upload.begin_verification! }
    end
    assert_equal "receiving", upload.reload.status
    assert File.exist?(upload.staged_path)
  end

  private

  def signed_headers(body, operation, offset: nil, sent_at: Time.current.to_i, signature: nil, content_type: "application/octet-stream", device_id: @recorder.device_id)
    signature ||= OpenSSL::HMAC.hexdigest("SHA256", @key, SIGNATURE_DOMAIN + canonical(body, operation, sent_at, device_id:))
    {
      "CONTENT_TYPE" => content_type,
      "ACCEPT" => "application/json",
      "X-FDR-Device-ID" => device_id,
      "X-FDR-Sent-At" => sent_at.to_s,
      "X-FDR-Signature" => signature,
      "X-FDR-Upload-Offset" => offset&.to_s
    }.compact
  end

  def canonical(body, operation, sent_at, device_id: @recorder.device_id)
    [ device_id, operation, sent_at, Digest::SHA256.hexdigest(body) ].join("\n")
  end

  def valid_file
    header_body = [ "EXOFDR1\0", 3, 64, 4_110_214_648, 777_000, "fdr-test", "" ].pack("a8vvVQ<a24a12")
    header = header_body + [ Zlib.crc32(header_body) ].pack("V")
    payload = [ 40, 6, "Storage ready" ].pack("vCa48")
    header + record(payload:, sequence: 0, timestamp_us: 1_000_000) +
      record(payload:, sequence: 1, timestamp_us: 6_000_000)
  end

  def record(payload:, sequence:, timestamp_us:)
    body = [ 0xA55A, 2, 4, 28, payload.bytesize, 1, 0, sequence, timestamp_us ].pack("vCCvvvvVQ<")
    body + [ Zlib.crc32(body + payload) ].pack("V") + payload
  end
end
