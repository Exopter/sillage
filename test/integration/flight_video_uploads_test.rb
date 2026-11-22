require "test_helper"

class FlightVideoUploadsTest < ActionDispatch::IntegrationTest
  UPLOAD = Flights::DirectVideoUpload
  Part = Struct.new(:part_number, :size, :etag, keyword_init: true)

  setup do
    @previous = Rails.configuration.x.flight_video_direct_service
    Rails.configuration.x.flight_video_direct_service = :test_direct
    @client = ActiveStorage::Blob.services.fetch("test_direct").client.client
    @client.stub_responses(:create_multipart_upload, upload_id: "multipart-1")
    @client.stub_responses(:list_parts, parts: [], is_truncated: false)
    @user = users(:operator)
    @flight = @user.flights.create!(name: "Logged flight", status: "logged", visibility: "private", flown_on: Date.current, location: "Test location")
    sign_in_as @user
  end

  teardown { Rails.configuration.x.flight_video_direct_service = @previous }

  test "a video goes to storage in signed parts, resumes and is queued once" do
    size = UPLOAD::PART_SIZE + 10
    start = -> { post flight_video_uploads_path(@flight), params: { filename: "jump.mp4", content_type: "video/mp4", byte_size: size, last_modified: 123 }, as: :json; response.parsed_body }
    body = start.call
    assert_equal [], body["received"]

    post sign_flight_video_upload_path(@flight, body["id"]), params: { parts: "1,2" }
    assert_response :success
    assert_includes response.parsed_body.dig("urls", "2"), "partNumber=2"
    assert_not_includes response.parsed_body.dig("urls", "2"), "checksum"

    @client.stub_responses(:list_parts, parts: [ { part_number: 1, size: UPLOAD::PART_SIZE, etag: "one" } ], is_truncated: false)
    assert_equal [ 1 ], start.call["received"]
    post complete_flight_video_upload_path(@flight, body["id"])
    assert_response :conflict

    @client.stub_responses(:list_parts, parts: [ { part_number: 1, size: UPLOAD::PART_SIZE, etag: "one" }, { part_number: 2, size: 10, etag: "two" } ], is_truncated: false)
    assert_enqueued_jobs 1, only: FlightVideoProcessingJob do
      2.times do
        post complete_flight_video_upload_path(@flight, body["id"])
        assert_response :success
      end
    end
    assert_equal 1, @client.api_requests.count { |request| request[:operation_name] == :complete_multipart_upload }
    assert_equal "processing", @flight.reload.video_processing_status
    assert_equal "test_direct", @flight.video_upload.blob.service_name
  end

  test "rejects a file that is not a video, an oversized file and an unknown part" do
    post flight_video_uploads_path(@flight), params: { filename: "notes.txt", content_type: "text/plain", byte_size: 10, last_modified: 1 }, as: :json
    assert_response :unprocessable_entity
    post flight_video_uploads_path(@flight), params: { filename: "jump.mp4", content_type: "video/mp4", byte_size: UPLOAD::MAX_BYTE_SIZE + 1, last_modified: 1 }, as: :json
    assert_response :unprocessable_entity

    post flight_video_uploads_path(@flight), params: { filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 1 }, as: :json
    post sign_flight_video_upload_path(@flight, response.parsed_body["id"]), params: { parts: "2" }
    assert_response :unprocessable_entity
  end

  test "an upload belongs to its user and a hidden flight stays hidden" do
    upload = UPLOAD.start(flight: @flight, user: @user, filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 1)
    sign_in_as users(:julien)
    post sign_flight_video_upload_path(@flight, upload.id), params: { parts: "1" }
    assert_response :not_found

    hidden = users(:julien).flights.create!(name: "Hidden", status: "logged", visibility: "private", flown_on: Date.current, location: "Test location")
    sign_in_as @user
    post flight_video_uploads_path(hidden), params: { filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 1 }, as: :json
    assert_response :not_found
  end

  test "abandoned uploads are aborted and removed" do
    upload = UPLOAD.start(flight: @flight, user: @user, filename: "jump.mp4", content_type: "video/mp4", byte_size: 10, last_modified: 1)
    UPLOAD.sweep(now: 1.hour.from_now)
    assert ActiveStorage::Blob.exists?(upload.blob.id)
    UPLOAD.sweep(now: 2.days.from_now)
    assert_not ActiveStorage::Blob.exists?(upload.blob.id)
    assert @client.api_requests.any? { |request| request[:operation_name] == :abort_multipart_upload }
  end

  test "the form falls back to a plain upload without object storage" do
    Rails.configuration.x.flight_video_direct_service = nil
    get flight_path(@flight)
    assert_select "form.video-upload-form[data-upload-direct-url-value]", count: 0
    post flight_video_uploads_path(@flight), params: { filename: "jump.mp4", byte_size: 10 }, as: :json
    assert_response :not_found
  end
end
