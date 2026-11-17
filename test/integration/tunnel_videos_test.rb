require "test_helper"

class TunnelVideosTest < ActionDispatch::IntegrationTest
  setup do
    @flight = flights(:one)
    @side = tunnel_video("Side", "a", 20)
    @top = tunnel_video("Top", "b", 20)
    tunnel_video("Front", "c", 20, status: "pending", attach: false)
    sign_in_as users(:julien)
  end

  test "the flight page offers each stored camera aligned on the recording clock" do
    get flight_path(@flight)

    assert_response :success
    assert_select "section[data-flight-viewer-video-start-elapsed-value='20.0']"
    assert_select "video.flight-video[src='#{attachment_path(@side.file.attachment)}']"
    assert_select "button[data-flight-viewer-target='videoSource']", 2
    assert_select "button[aria-pressed='true'][data-flight-viewer-start-elapsed-param='20.0']", text: "Side"
    assert_select "button[data-flight-viewer-src-param='#{attachment_path(@top.file.attachment)}']", text: "Top"
  end

  test "tunnel clips follow the visibility of their flight" do
    get attachment_path(@side.file.attachment), headers: { "Range" => "bytes=0-3" }
    assert_response :partial_content
    assert_match(/inline/, response.headers["Content-Disposition"])

    sign_in_as users(:operator)
    get attachment_path(@side.file.attachment)
    assert_response :not_found

    @side.update!(flight: nil)
    sign_in_as users(:julien)
    get attachment_path(@side.file.attachment)
    assert_response :not_found
  end

  test "an operator removes every camera of a clip filmed outside the flight" do
    setup_clip = tunnel_video("Side", "d", 60, clip_number: 2)
    other_camera = tunnel_video("Top", "e", 60, clip_number: 2)

    get flight_path(@flight)
    assert_select "form[action='#{flight_tunnel_video_path(@flight, setup_clip)}'] button", text: /Remove clip 2/

    delete flight_tunnel_video_path(@flight, setup_clip)

    assert_redirected_to flight_path(@flight)
    assert_equal %w[ignored ignored], [ setup_clip, other_camera ].map { |video| video.reload.status }
    assert_not setup_clip.file.attached?
    assert_equal "ready", @side.reload.status
    follow_redirect!
    assert_select "button[data-flight-viewer-target='videoSource']", 2
  end

  test "a member who cannot manage operations cannot remove a clip" do
    @flight.update!(visibility: "team")
    sign_in_as users(:operator)

    delete flight_tunnel_video_path(@flight, @side)

    assert_equal "ready", @side.reload.status
  end

  private

  def tunnel_video(camera, token, offset, status: "ready", attach: true, clip_number: 1)
    TunnelVideo.create!(flight: @flight, media_token: token * 40, filename: "##{clip_number}_20260515_200219_#{camera}.mp4", camera:, clip_number:,
      timeslot_at: @flight.started_at.beginning_of_hour,
      source_url: "https://shop.example.test/index.php?media_token=#{token * 40}", recorded_at: @flight.started_at + offset, status:).tap do |video|
      video.file.attach(io: StringIO.new("0123456789"), filename: "clip.mp4", content_type: "video/mp4", identify: false) if attach
    end
  end
end
