require "test_helper"
require_relative "../support/method_replacement"

class FlightVideoProcessingJobTest < ActiveSupport::TestCase
  include MethodReplacement

  test "an older result cannot replace a newer completed video or purge its source" do
    flight = flights(:one)
    first = video_blob("first.mov")
    second = video_blob("second.mov")
    replacement = video_blob("second-web.mp4")
    flight.video_upload.attach(first)
    flight.update!(video_processing_status: "processing")
    optimizer = Object.new
    optimizer.define_singleton_method(:call) do
      newer = Flight.find(flight.id)
      newer.video_upload.attach(second)
      newer.video.attach(replacement)
      newer.update!(video_processing_status: "ready", video_duration_seconds: 20)
      output = Tempfile.new([ "video-test", ".mp4" ], binmode: true)
      output.write("stale output")
      output.rewind
      Videos::WebOptimizer::Result.new(io: output, filename: "first-web.mp4", duration_seconds: 10)
    end

    replace_method(Videos::WebOptimizer, :new, ->(*) { optimizer }) do
      assert_no_difference -> { ActiveStorage::Blob.count } do
        FlightVideoProcessingJob.perform_now(flight, first)
      end
    end
    flight.reload
    assert_equal replacement, flight.video.blob
    assert_equal second, flight.video_upload.blob
    assert_equal "ready", flight.video_processing_status
    assert_equal 20, flight.video_duration_seconds
  end

  test "a stale failure cannot change a newer upload status" do
    flight = flights(:one)
    first = video_blob("first.mov")
    second = video_blob("second.mov")
    flight.video_upload.attach(first)
    optimizer = Object.new
    optimizer.define_singleton_method(:call) do
      newer = Flight.find(flight.id)
      newer.video_upload.attach(second)
      newer.update!(video_processing_status: "processing", video_processing_error: nil)
      raise Videos::WebOptimizer::Error, "Old source failed"
    end
    replace_method(Videos::WebOptimizer, :new, ->(*) { optimizer }) do
      assert_raises(Videos::WebOptimizer::Error) { FlightVideoProcessingJob.perform_now(flight, first) }
    end
    assert_equal "processing", flight.reload.video_processing_status
    assert_nil flight.video_processing_error
    assert_equal second, flight.video_upload.blob
  end

  test "a failed replacement preserves the previous playable video and synchronization" do
    flight = flights(:one)
    source = video_blob("new.mov")
    previous = video_blob("previous.mp4")
    flight.video.attach(previous)
    flight.video_upload.attach(source)
    flight.update!(video_processing_status: "processing", video_exit_offset_seconds: 4, video_duration_seconds: 30)
    optimizer = Object.new
    optimizer.define_singleton_method(:call) { raise Videos::WebOptimizer::Error, "Bad video" }
    replace_method(Videos::WebOptimizer, :new, ->(*) { optimizer }) do
      assert_raises(Videos::WebOptimizer::Error) { FlightVideoProcessingJob.perform_now(flight, source) }
    end
    assert_equal "failed", flight.reload.video_processing_status
    assert flight.video_ready?
    assert_equal previous, flight.video.blob
    assert_equal 4, flight.video_exit_offset_seconds
    assert_equal 30, flight.video_duration_seconds
  end

  private

  def video_blob(name)
    ActiveStorage::Blob.create_and_upload!(io: StringIO.new(name), filename: name, content_type: "video/mp4")
  end
end
