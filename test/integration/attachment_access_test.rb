require "test_helper"
require_relative "../support/method_replacement"

class AttachmentAccessTest < ActionDispatch::IntegrationTest
  include MethodReplacement
  setup do
    @flight = flights(:one)
    @flight.video.attach(io: StringIO.new("0123456789"), filename: "flight.mp4", content_type: "video/mp4", identify: false)
    @video = @flight.video.attachment
    sign_in_as users(:julien)
  end

  test "owner can stream private video and seek using byte ranges without public caching" do
    get attachment_path(@video)
    assert_response :success
    assert_equal "0123456789", response.body
    assert_includes response.headers["Cache-Control"], "no-store"
    assert_match(/inline/, response.headers["Content-Disposition"])

    get attachment_path(@video), headers: { "Range" => "bytes=2-5" }
    assert_response :partial_content
    assert_equal "2345", response.body
    assert_equal "bytes 2-5/10", response.headers["Content-Range"]
    assert_includes response.headers["Cache-Control"], "no-store"

    get attachment_path(@video), headers: { "Range" => "bytes=20-30" }
    assert_response :range_not_satisfiable
  end

  test "video links check current flight visibility on every request" do
    sign_in_as users(:operator)
    get attachment_path(@video)
    assert_response :not_found
    @flight.update!(visibility: "team")
    get attachment_path(@video), headers: { "Range" => "bytes=0-3" }
    assert_response :partial_content
    assert_equal "0123", response.body
    @flight.update!(visibility: "private")
    get attachment_path(@video), headers: { "Range" => "bytes=0-3" }
    assert_response :not_found
  end

  test "local video seeking streams open ended ranges beyond the proxy chunk limit" do
    replace_method(ActiveStorage, :streaming_chunk_max_size, -> { 5 }) do
      get attachment_path(@video), headers: { "Range" => "bytes=2-" }
      assert_response :partial_content
      assert_equal "23456789", response.body
      assert_equal "bytes 2-9/10", response.headers["Content-Range"]
      assert_includes response.headers["Cache-Control"], "no-store"
    end
  end

  test "missing stored files return not found after authorization" do
    @video.blob.service.delete(@video.blob.key)
    get attachment_path(@video)
    assert_response :not_found
  end

  test "team video is not accessible to signed out users" do
    @flight.update!(visibility: "team")
    delete logout_path
    get attachment_path(@video)
    assert_redirected_to new_session_path
  end

  test "sharing a flight does not expose original uploads recordings or sibling private flights" do
    @flight.update!(visibility: "team")
    @flight.video_upload.attach(io: StringIO.new("original"), filename: "original.mp4", content_type: "video/mp4")
    import = @flight.flight_import
    import.source_files.attach(io: StringIO.new("private telemetry"), filename: "source.csv")
    sibling = import.flights.create!(user: @flight.user, name: "Private sibling")
    signal = @flight.signal_sessions.create!(user: @flight.user, started_at: Time.current)
    signal.raw_capture.attach(io: StringIO.new("private capture"), filename: "capture.bin")
    attachments = [ @flight.video_upload.attachment, import.source_files.first, signal.raw_capture.attachment ]

    attachments.each do |attachment|
      get attachment_path(attachment)
      assert_response :success
      assert_match(/attachment/, response.headers["Content-Disposition"])
    end
    sign_in_as users(:operator)
    attachments.each do |attachment|
      get attachment_path(attachment)
      assert_response :not_found
    end
    get flight_path(sibling)
    assert_response :not_found
  end

  test "default Active Storage routes cannot bypass flight access even with a signed blob id" do
    blob = @video.blob
    [ "/rails/active_storage/blobs/redirect/#{blob.signed_id}/flight.mp4",
      "/rails/active_storage/blobs/proxy/#{blob.signed_id}/flight.mp4",
      "/rails/active_storage/disk/known-signed-key/flight.mp4" ].each do |url|
      assert_raises(ActionController::RoutingError) do
        Rails.application.routes.recognize_path(url, method: :get)
      end
    end
  end

  test "another administrator cannot access a private flight attachment" do
    @flight.update!(user: users(:operator))
    get attachment_path(@video)
    assert_response :not_found
  end

  test "Forge artifacts remain downloadable by signed in team members" do
    build = Build.create!(assembly: create_exofdr_assembly(name: "Attachment test"), created_by: users(:julien))
    run = TestRun.create!(build:, operator: users(:julien), uuid: SecureRandom.uuid,
      recipe_id: "FDR_SMOKE_V1", recipe_version: "1", recipe_sha256: "a" * 64,
      ingestion_sha256: "b" * 64, outcome: "passed", ran_at: Time.current)
    run.artifacts.attach(io: StringIO.new("test evidence"), filename: "result.txt")
    sign_in_as users(:operator)
    get forge_test_run_path(run)
    assert_response :success
    assert_select "a[href=?]", attachment_path(run.artifacts.first)
    get attachment_path(run.artifacts.first)
    assert_response :success
    assert_equal "test evidence", response.body
    assert_includes response.headers["Cache-Control"], "no-store"
  end
end
