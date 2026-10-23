require "test_helper"
require "tmpdir"
require_relative "../../lib/sillage/canonical_source"

class CanonicalSourceTest < ActiveSupport::TestCase
  test "Windows text sources produce canonical LF bytes without changing content" do
    Dir.mktmpdir do |directory|
      %w[.css .js .jsx .json .svg].each do |extension|
        path = File.join(directory, "source#{extension}")
        File.binwrite(path, "first\r\nsecond\r\n")
        assert_equal "first\nsecond\n", Sillage::CanonicalSource.read(path)
        assert_equal "first\r\nsecond\r\n", File.binread(path)
      end
    end
  end

  test "binary geometry keeps every byte including CRLF sequences" do
    Dir.mktmpdir do |directory|
      path = File.join(directory, "scene.glb")
      content = "glTF\x00\r\n\xFF".b
      File.binwrite(path, content)
      assert_equal content, Sillage::CanonicalSource.read(path)
    end
  end

  test "normalization preserves a real content difference" do
    Dir.mktmpdir do |directory|
      path = File.join(directory, "source.css")
      File.binwrite(path, ":root { --color: red; }\r\n")
      assert_not_equal ":root { --color: blue; }\n", Sillage::CanonicalSource.read(path)
    end
  end
end
