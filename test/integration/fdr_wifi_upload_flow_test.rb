require "test_helper"
require "digest"
require "fileutils"
require "openssl"
require "zlib"

class FdrWifiUploadFlowTest < ActionDispatch::IntegrationTest
  SIGNATURE_DOMAIN = "exopter/fdr/wifi-upload/v1\0".b

  setup do
    @recorder = Assembly.create!(name: "Wi-Fi upload recorder", device_id: "EXOFDR-A172E0")
    @key = @recorder.ensure_fdr_auth_key!
    Installation.create!(aircraft: aircraft(:pilatus), installable: @recorder, installed_at: 1.hour.ago)
    @binary = valid_file
    @manifest = {
      filename: "FDR000001.BIN",
      file_index: 1,
      boot_id: 1_234,
      format_version: 3,
      size_bytes: @binary.bytesize,
      sha256: Digest::SHA256.hexdigest(@binary)
    }
  end

  teardown do
    FdrWifiUpload.where(assembly: @recorder).find_each do |upload|
      FileUtils.rm_f(upload.staged_path)
    end
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

    assert_enqueued_with(job: ExoFdrImportJob) do
      perform_enqueued_jobs only: FdrWifiUploadFinalizeJob do
        post complete_api_v1_fdr_wifi_upload_path(token),
          params: "",
          headers: signed_headers("", "complete:#{token}")
        assert_response :success
      end
    end

    upload = FdrWifiUpload.find_by!(token:)
    assert_equal "complete", upload.status
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

  private

  def signed_headers(body, operation, offset: nil, sent_at: Time.current.to_i, signature: nil, content_type: "application/octet-stream")
    signature ||= OpenSSL::HMAC.hexdigest("SHA256", @key, SIGNATURE_DOMAIN + canonical(body, operation, sent_at))
    {
      "CONTENT_TYPE" => content_type,
      "ACCEPT" => "application/json",
      "X-FDR-Device-ID" => @recorder.device_id,
      "X-FDR-Sent-At" => sent_at.to_s,
      "X-FDR-Signature" => signature,
      "X-FDR-Upload-Offset" => offset&.to_s
    }.compact
  end

  def canonical(body, operation, sent_at)
    [ @recorder.device_id, operation, sent_at, Digest::SHA256.hexdigest(body) ].join("\n")
  end

  def valid_file
    header_body = [ "EXOFDR1\0", 3, 64, 1_234, 777_000, "fdr-test", "" ].pack("a8vvVQ<a24a12")
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
