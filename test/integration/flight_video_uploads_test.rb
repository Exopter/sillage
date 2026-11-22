require "test_helper"

class FlightVideoUploadsTest < ActionDispatch::IntegrationTest
  CHUNK = Flights::ChunkedVideoUpload

  setup do
    FileUtils.rm_rf(CHUNK.root)
    @user = users(:operator)
    @flight = @user.flights.create!(name: "Logged flight", status: "logged", visibility: "private", flown_on: Date.current, location: "Test location")
    sign_in_as @user
  end

  teardown { FileUtils.rm_rf(CHUNK.root) }

  test "a video sent in chunks resumes and is queued once" do
    original = CHUNK::CHUNK_SIZE
    silence_warnings { CHUNK.const_set(:CHUNK_SIZE, 4) }
    start = -> { post flight_video_uploads_path(@flight), params: { filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 123 }, as: :json; response.parsed_body }

    body = start.call
    assert_equal [], body["received"]
    put chunk_flight_video_upload_path(@flight, body["id"], index: 1), params: "efgh", headers: { "Content-Type" => "application/octet-stream" }
    assert_response :no_content

    post complete_flight_video_upload_path(@flight, body["id"])
    assert_response :conflict
    assert_equal [ 1 ], start.call["received"]

    put chunk_flight_video_upload_path(@flight, body["id"], index: 0), params: "abcd", headers: { "Content-Type" => "application/octet-stream" }
    put chunk_flight_video_upload_path(@flight, body["id"], index: 2), params: "ij", headers: { "Content-Type" => "application/octet-stream" }

    assert_enqueued_jobs 1, only: FlightVideoProcessingJob do
      2.times do
        post complete_flight_video_upload_path(@flight, body["id"])
        assert_response :success
      end
    end
    assert_equal "abcdefghij", @flight.reload.video_upload.download
    assert_equal "processing", @flight.video_processing_status
  ensure
    silence_warnings { CHUNK.const_set(:CHUNK_SIZE, original) }
  end

  test "rejects a chunk of the wrong size and a file that is not a video" do
    post flight_video_uploads_path(@flight), params: { filename: "notes.txt", content_type: "text/plain", byte_size: 10, last_modified: 1 }, as: :json
    assert_response :unprocessable_entity

    post flight_video_uploads_path(@flight), params: { filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 1 }, as: :json
    put chunk_flight_video_upload_path(@flight, response.parsed_body["id"], index: 0), params: "short", headers: { "Content-Type" => "application/octet-stream" }
    assert_response :unprocessable_entity
  end

  test "an upload belongs to its user and a hidden flight stays hidden" do
    upload = CHUNK.start(flight: @flight, user: @user, filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 1)
    sign_in_as users(:julien)
    put chunk_flight_video_upload_path(@flight, upload.id, index: 0), params: "abcd", headers: { "Content-Type" => "application/octet-stream" }
    assert_response :not_found

    hidden = users(:julien).flights.create!(name: "Hidden", status: "logged", visibility: "private", flown_on: Date.current, location: "Test location")
    sign_in_as @user
    post flight_video_uploads_path(hidden), params: { filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 1 }, as: :json
    assert_response :not_found
  end

  test "abandoned uploads are swept" do
    upload = CHUNK.start(flight: @flight, user: @user, filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 1)
    CHUNK.sweep(now: 1.hour.from_now)
    assert upload.directory.exist?
    CHUNK.sweep(now: 2.days.from_now)
    assert_not upload.directory.exist?
  end
end
