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

  test "folder membership authorizes video ranges and revocation applies immediately" do
    folder = users(:julien).flight_folders.create!(name: "Video review", visibility: "shared", members: [ users(:operator) ])
    @flight.update!(folder: folder)
    sign_in_as users(:operator)
    get attachment_path(@video), headers: { "Range" => "bytes=0-3" }
    assert_response :partial_content
    assert_equal "0123", response.body
    folder.memberships.destroy_all
    get attachment_path(@video), headers: { "Range" => "bytes=0-3" }
    assert_response :not_found
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

  test "sharing a flight exposes its own sources but not archives containing private siblings" do
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
    get attachment_path(@flight.video_upload.attachment)
    assert_response :success
    get attachment_path(signal.raw_capture.attachment)
    assert_response :success
    get attachment_path(import.source_files.first)
    assert_response :not_found
    get flight_path(sibling)
    assert_response :not_found
  end

  test "Seat recordings link each segment through the authorized attachment route" do
    import = @flight.flight_import
    import.update!(details: { "signal_flight_id" => @flight.id })
    %w[first.bin second.bin].each do |filename|
      import.source_files.attach(io: StringIO.new(filename), filename: filename, content_type: "application/octet-stream")
    end
    retry_import = import.dup
    retry_import.save!
    retry_import.source_files.attach(io: StringIO.new("first.bin"), filename: "first.bin", content_type: "application/octet-stream")

    get flight_path(@flight)
    assert_response :success
    assert_select "#analysis > section:last-child[aria-labelledby='raw-data-title']" do
      assert_select "h2", "Download raw data"
      assert_select "a[download]", count: 3
      assert_select "a[href=?]", flight_path(@flight, format: :csv)
    end
    import.source_files.each do |source|
      assert_select "#analysis a[href=?] span", attachment_path(source), text: source.filename.to_s
    end
  end

  test "directly attached binary excerpts are available without a Signal session" do
    import = @flight.flight_import
    import.source_files.attach(io: StringIO.new("excerpt"), filename: "flight.BIN")
    get flight_path(@flight)
    assert_select "#analysis a[href=?]", attachment_path(import.source_files.sole)
  end

  test "a shared import offers only binaries referenced by the selected flight" do
    import = @flight.flight_import
    flights(:two).update!(flight_import: import)
    first, second = %w[first.BIN second.BIN].map do |name|
      import.source_files.attach(io: StringIO.new(name), filename: name)
      import.source_files.attachments.last
    end
    sensor_samples(:one).update!(source_blob_id: first.blob_id)
    get flight_path(@flight)
    assert_select "#analysis a[href=?]", attachment_path(first)
    assert_select "#analysis a[href=?]", attachment_path(second), count: 0
  end

  test "a flight without measurements or binary has no download section" do
    @flight.sensor_samples.delete_all
    @flight.track_points.delete_all
    get flight_path(@flight)
    assert_response :success
    assert_select "#raw-data-title", count: 0
    get flight_path(@flight, format: :csv)
    assert_response :not_found
  end

  test "raw export keeps every observation across batch boundaries" do
    require "csv"
    @flight.sensor_samples.insert_all!(1_025.times.map do |i|
      { sensor_type: "AIRSPEED", elapsed_seconds: i + 2, readings: { differential_pressure_pa: i } }
    end)
    get flight_path(@flight, format: :csv)
    assert_response :success
    rows = CSV.parse(response.body, headers: true)
    assert_equal (0..1024).to_a, rows["reading.differential_pressure_pa"].compact.map(&:to_i)
    assert_equal 1027, rows.size
  end

  test "raw CSV includes all flight observations in time order with full precision and separate channels" do
    require "csv"
    sensor_samples(:one).update!(elapsed_seconds: 0.125, recorded_at: Time.utc(2026, 5, 15, 20, 2, 0, 123456),
      sensor_type: "CENTRAL:IMU", readings: { x: -1.25, source_role: "central", label: "=1+1", nested: { quality: 3 } })
    get flight_path(@flight, format: :csv)
    assert_response :success
    assert_equal "text/csv", response.media_type
    assert_includes response.headers["Content-Disposition"], "#{@flight.code}-raw-data.csv"
    assert_includes response.headers["Cache-Control"], "no-store"
    rows = CSV.parse(response.body, headers: true)
    assert_equal [ "CENTRAL:IMU", "GPS" ], rows["sensor_type"]
    assert_equal [ "2026-05-15T20:02:00.123456Z", "central", "-1.25", "'=1+1", '{"quality":3}' ],
      rows.first.values_at("recorded_at_utc", "reading.source_role", "reading.x", "reading.label", "reading.nested")
    assert_equal "1.5", rows[1]["lat"]
    sign_in_as users(:operator)
    get flight_path(@flight, format: :csv)
    assert_response :not_found
    @flight.update!(visibility: "team")
    get flight_path(@flight, format: :csv)
    assert_response :success
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
end
