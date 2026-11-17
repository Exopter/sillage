require "test_helper"

class TunnelMedia::SyncTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  NOW = Time.utc(2026, 11, 17, 12)
  SLOT = Time.utc(2026, 11, 17, 9, 0).to_i

  FakeListing = Struct.new(:clips, :timeslots, :skipped_filenames)

  class FakeClient
    attr_reader :requested

    def initialize(listings)
      @listings = listings
      @requested = []
    end

    def sign_in
      FakeListing.new([], @listings.keys, [])
    end

    def timeslot(epoch)
      @requested << epoch
      @listings.fetch(epoch)
    end
  end

  setup do
    @configuration = TunnelMedia::Configuration.new(url: "https://media.example.test/proflyer", login: "pilot",
      password: "secret", time_zone: "Europe/Ljubljana", location: "Tunnel", cameras: %w[Side Top])
    @first = tunnel_flight("FLT-2026-901", "09:18:26", "09:21:11")
    @second = tunnel_flight("FLT-2026-902", "09:22:29", "09:26:00")
  end

  test "catalogues every camera, matches by time and queues only configured cameras" do
    client = FakeClient.new(SLOT => FakeListing.new(clips("09:18:54", "09:23:45"), [ SLOT ], [ "IMG_1.jpg" ]))

    result = nil
    assert_enqueued_jobs 4, only: TunnelVideoDownloadJob do
      result = sync(client).call
    end

    assert_equal [ 6, 6, 4, [ "IMG_1.jpg" ] ], result.to_a
    assert_equal [ @first.id ] * 3 + [ @second.id ] * 3, TunnelVideo.playback_order.pluck(:flight_id)
    assert_equal [ "interval" ], TunnelVideo.distinct.pluck(:match_method)
    assert_equal Time.utc(2026, 11, 17, 9), TunnelVideo.first.timeslot_at
  end

  test "a second run stores nothing new and does not move matched clips" do
    client = FakeClient.new(SLOT => FakeListing.new(clips("09:18:54", "09:23:45"), [], []))
    sync(client).call
    TunnelVideo.update_all(status: "ready")

    assert_no_enqueued_jobs do
      assert_equal [ 0, 0, 0, [] ], sync(client).call.to_a
    end
    assert_equal 6, TunnelVideo.count
  end

  test "ignores flights at another location and keeps their clips for review" do
    @first.update!(location: "Dropzone")
    client = FakeClient.new(SLOT => FakeListing.new(clips("09:18:54"), [], []))

    assert_equal 0, sync(client).call.matched
    assert_equal 3, TunnelVideo.unmatched.count
  end

  test "ignores sky flights at the tunnel location" do
    @first.update!(environment: "sky")
    client = FakeClient.new(SLOT => FakeListing.new(clips("09:18:54"), [], []))

    assert_no_enqueued_jobs do
      assert_equal 0, sync(client).call.matched
    end
    assert_equal 3, TunnelVideo.unmatched.count
  end

  test "the portal is only needed while a recent flight at the tunnel has no clip" do
    assert TunnelMedia::Sync.awaiting_clips?(@configuration, now: NOW)
    assert_not TunnelMedia::Sync.awaiting_clips?(@configuration, now: NOW + 4.days)

    sync(FakeClient.new(SLOT => FakeListing.new(clips("09:18:54", "09:23:45"), [], []))).call
    assert_not TunnelMedia::Sync.awaiting_clips?(@configuration, now: NOW)

    @second.tunnel_videos.destroy_all
    @second.update!(location: "Dropzone")
    assert_not TunnelMedia::Sync.awaiting_clips?(@configuration, now: NOW)

    @second.update!(location: "Tunnel", environment: "sky")
    assert_not TunnelMedia::Sync.awaiting_clips?(@configuration, now: NOW)
    @second.update!(environment: "tunnel")
    assert TunnelMedia::Sync.awaiting_clips?(@configuration, now: NOW)
  end

  test "reads an old timeslot once and follows timeslots revealed by later pages" do
    old = Time.utc(2026, 11, 10, 9).to_i
    older = Time.utc(2026, 11, 9, 9).to_i
    client = FakeClient.new(old => FakeListing.new(clips("09:18:54", day: 10), [ older ], []), older => FakeListing.new([], [], []))
    sync(client).call
    assert_equal [ old, older ], client.requested

    again = FakeClient.new(old => FakeListing.new([], [], []))
    sync(again).call
    assert_empty again.requested
  end

  private

  def sync(client)
    TunnelMedia::Sync.new(configuration: @configuration, client:, now: NOW)
  end

  def clips(*times, day: 17)
    times.flat_map do |time|
      %w[Front Side Top].map do |camera|
        token = SecureRandom.hex(20)
        TunnelMedia::Listing::Clip.new(media_token: token, filename: "#1_202611#{day}_#{time.delete(":")}_#{camera}.mp4",
          source_url: "https://shop.example.test/index.php?media_token=#{token}", camera:, clip_number: 1,
          recorded_at: Time.utc(2026, 11, day, *time.split(":").map(&:to_i)))
      end
    end
  end

  def tunnel_flight(code, started, ended)
    flights(:one).dup.tap do |flight|
      flight.assign_attributes(code:, location: "Tunnel", environment: "tunnel", flight_import: nil,
        started_at: Time.utc(2026, 11, 17, *started.split(":").map(&:to_i)), ended_at: Time.utc(2026, 11, 17, *ended.split(":").map(&:to_i)))
      flight.save!
    end
  end
end
