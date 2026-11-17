require "test_helper"
require_relative "../support/method_replacement"

class TunnelVideoDownloadJobTest < ActiveSupport::TestCase
  include MethodReplacement

  setup do
    @video = TunnelVideo.create!(flight: flights(:one), media_token: "a" * 40, filename: "#1_20261117_101854_Side.mp4",
      source_url: "https://shop.example.test/index.php?media_token=#{"a" * 40}", camera: "Side", clip_number: 1,
      recorded_at: flights(:one).started_at + 30)
  end

  test "stores the optimized clip and removes the downloaded source" do
    optimizer = Object.new
    optimizer.define_singleton_method(:call) do
      output = Tempfile.new([ "tunnel-test", ".mp4" ], binmode: true)
      output.write("optimized")
      output.rewind
      Videos::WebOptimizer::Result.new(io: output, filename: "clip-web.mp4", duration_seconds: 120.5)
    end

    replace_method(TunnelMedia::Client, :download, ->(_url, io) { io.write("source") }) do
      replace_method(Videos::WebOptimizer, :new, ->(*) { optimizer }) do
        assert_difference -> { ActiveStorage::Blob.count }, 1 do
          TunnelVideoDownloadJob.perform_now(@video)
        end
      end
    end

    @video.reload
    assert @video.ready?
    assert_equal 120.5, @video.duration_seconds
    assert_equal "optimized", @video.file.download
    assert_equal 30.0, @video.start_elapsed_seconds
  end

  test "ignores an accidental one-second clip" do
    optimizer = Object.new
    optimizer.define_singleton_method(:call) do
      Videos::WebOptimizer::Result.new(io: Tempfile.new([ "tunnel-test", ".mp4" ]), filename: "clip-web.mp4", duration_seconds: 1.0)
    end

    replace_method(TunnelMedia::Client, :download, ->(_url, io) { io.write("source") }) do
      replace_method(Videos::WebOptimizer, :new, ->(*) { optimizer }) do
        assert_no_difference -> { ActiveStorage::Blob.count } do
          TunnelVideoDownloadJob.perform_now(@video)
        end
      end
    end

    assert_equal [ "ignored", 1.0 ], @video.reload.values_at(:status, :duration_seconds)
    assert_not @video.file.attached?
  end

  test "records a download failure and stays retryable" do
    replace_method(TunnelMedia::Client, :download, ->(*) { raise TunnelMedia::Client::Error, "HTTP 404" }) do
      assert_raises(TunnelMedia::Client::Error) { TunnelVideoDownloadJob.perform_now(@video) }
    end

    assert_equal [ "failed", "HTTP 404" ], @video.reload.values_at(:status, :error_message)
    assert_not @video.file.attached?
  end

  test "resumes a download interrupted by a restart" do
    @video.update!(status: "downloading")
    optimizer = Object.new
    optimizer.define_singleton_method(:call) do
      output = Tempfile.new([ "tunnel-test", ".mp4" ], binmode: true)
      output.write("optimized")
      output.rewind
      Videos::WebOptimizer::Result.new(io: output, filename: "clip-web.mp4", duration_seconds: 120.5)
    end

    replace_method(TunnelMedia::Client, :download, ->(_url, io) { io.write("source") }) do
      replace_method(Videos::WebOptimizer, :new, ->(*) { optimizer }) { TunnelVideoDownloadJob.perform_now(@video) }
    end

    assert @video.reload.ready?
  end

  test "skips unmatched clips" do
    @video.update!(flight: nil)

    replace_method(TunnelMedia::Client, :download, ->(*) { flunk "must not download" }) do
      TunnelVideoDownloadJob.perform_now(@video)
    end
    assert_equal "pending", @video.reload.status
  end
end
