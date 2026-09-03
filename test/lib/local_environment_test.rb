require "test_helper"
require "tmpdir"

class LocalEnvironmentTest < ActiveSupport::TestCase
  TEST_KEYS = %w[CESIUM_ION_TOKEN LOCAL_RUNTIME_VALUE POSTGRES_PASSWORD].freeze

  test "loads local runtime values and the Cesium deployment fallback" do
    with_clean_environment do
      Dir.mktmpdir("sillage-local-environment") do |root|
        File.write(File.join(root, ".env.local"), "export LOCAL_RUNTIME_VALUE='local value'\n")
        File.write(
          File.join(root, ".env.deploy.local"),
          "CESIUM_ION_TOKEN=browser-token\nPOSTGRES_PASSWORD=production-password\n"
        )

        Sillage::LocalEnvironment.load(root: root)

        assert_equal "local value", ENV["LOCAL_RUNTIME_VALUE"]
        assert_equal "browser-token", ENV["CESIUM_ION_TOKEN"]
        assert_nil ENV["POSTGRES_PASSWORD"]
      end
    end
  end

  test "preserves values supplied by the process environment" do
    with_clean_environment do
      ENV["CESIUM_ION_TOKEN"] = "shell-token"

      Dir.mktmpdir("sillage-local-environment") do |root|
        File.write(File.join(root, ".env.local"), "CESIUM_ION_TOKEN=local-token\n")
        File.write(File.join(root, ".env.deploy.local"), "CESIUM_ION_TOKEN=deploy-token\n")

        Sillage::LocalEnvironment.load(root: root)

        assert_equal "shell-token", ENV["CESIUM_ION_TOKEN"]
      end
    end
  end

  private

  def with_clean_environment
    original_values = TEST_KEYS.to_h { |key| [ key, ENV[key] ] }
    TEST_KEYS.each { |key| ENV.delete(key) }
    yield
  ensure
    TEST_KEYS.each do |key|
      original_values[key].nil? ? ENV.delete(key) : ENV[key] = original_values[key]
    end
  end
end
