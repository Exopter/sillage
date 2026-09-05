require "test_helper"
require "shellwords"

class Videos::WebOptimizerTest < ActiveSupport::TestCase
  test "creates a web optimized mp4 with a 1080p ceiling" do
    ffmpeg_log = Tempfile.new("sillage-ffmpeg-log")
    ffmpeg_log.close
    ffmpeg = executable(<<~SH)
      #!/bin/sh
      printf '%s\\n' "$@" > #{Shellwords.escape(ffmpeg_log.path)}
      last=""
      for arg in "$@"; do last="$arg"; done
      printf optimized > "$last"
    SH
    ffprobe = executable(<<~SH)
      #!/bin/sh
      printf '12.345'
    SH
    blob = ActiveStorage::Blob.create_and_upload!(
      io: StringIO.new("raw video"),
      filename: "helmet cam.mov",
      content_type: "video/quicktime"
    )

    result = Videos::WebOptimizer.new(blob, ffmpeg_path: ffmpeg.path, ffprobe_path: ffprobe.path).call

    assert_equal "helmet-cam-web.mp4", result.filename
    assert_in_delta 12.345, result.duration_seconds
    assert_equal "optimized", result.io.read
    ffmpeg_args = File.read(ffmpeg_log.path)
    assert_includes ffmpeg_args, "force_original_aspect_ratio=decrease"
    assert_includes ffmpeg_args, "min(1080,ih)"
    assert_includes ffmpeg_args, "+faststart"
  ensure
    result&.close
    blob&.purge
    ffmpeg&.close!
    ffprobe&.close!
    ffmpeg_log&.close!
  end

  test "terminates a stuck transcoder and cleans temporary input and output" do
    ffmpeg = executable("#!/bin/sh\nsleep 30\n")
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("raw"), filename: "stuck.mov", content_type: "video/quicktime")
    before = Dir.glob(File.join(Dir.tmpdir, "sillage-{video,source}-*"))
    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    error = assert_raises(Videos::WebOptimizer::Error) do
      Videos::WebOptimizer.new(blob, ffmpeg_path: ffmpeg.path, timeout_seconds: 0.05).call
    end
    assert_match(/time limit/, error.message)
    assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - started, :<, 3
    assert_empty Dir.glob(File.join(Dir.tmpdir, "sillage-{video,source}-*")) - before
  ensure
    blob&.purge
    ffmpeg&.close!
  end

  test "failed conversion cleans its output immediately" do
    ffmpeg = executable("#!/bin/sh\nprintf 'invalid source' >&2\nexit 1\n")
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("raw"), filename: "bad.mov", content_type: "video/quicktime")
    before = Dir.glob(File.join(Dir.tmpdir, "sillage-{video,source}-*"))
    assert_raises(Videos::WebOptimizer::Error) { Videos::WebOptimizer.new(blob, ffmpeg_path: ffmpeg.path).call }
    assert_empty Dir.glob(File.join(Dir.tmpdir, "sillage-{video,source}-*")) - before
  ensure
    blob&.purge
    ffmpeg&.close!
  end

  private

  def executable(script)
    Tempfile.new("sillage-bin").tap do |file|
      file.write(script)
      file.flush
      file.chmod(0755)
      file.close
    end
  end
end
