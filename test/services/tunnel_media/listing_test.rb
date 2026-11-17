require "test_helper"

class TunnelMedia::ListingTest < ActiveSupport::TestCase
  ZONE = ActiveSupport::TimeZone["Europe/Ljubljana"]

  test "reads clips, timeslots and unrecognized files from a portal page" do
    listing = TunnelMedia::Listing.new(file_fixture("tunnel_media_listing.html").read, zone: ZONE)

    assert listing.signed_in?
    assert_equal [ 1794907800, 1794906000 ], listing.timeslots
    assert_equal [ "IMG_0042.jpg" ], listing.skipped_filenames
    side, top = listing.clips
    assert_equal "Side", side.camera
    assert_equal 1, side.clip_number
    assert_equal Time.utc(2026, 11, 17, 10, 14, 29), side.recorded_at
    assert_equal "https://shop.example.test/index.php?ctrl=do&do=download_media&media_token=#{side.media_token}&source=media_kiosk", side.source_url
    assert_equal [ "Top", 10, Time.utc(2026, 11, 17, 11, 0, 20) ], [ top.camera, top.clip_number, top.recorded_at ]
  end

  test "detects the sign-in form" do
    listing = TunnelMedia::Listing.new('<form><input type="password" name="password"></form>', zone: ZONE)

    assert_not listing.signed_in?
    assert_empty listing.clips
  end
end
