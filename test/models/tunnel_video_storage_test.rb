require "test_helper"

class TunnelVideoStorageTest < ActiveSupport::TestCase
  test "tunnel clips use the default service unless a bucket is configured" do
    assert_nil Rails.configuration.x.tunnel_video_storage_service
    assert_nil TunnelVideo.reflect_on_attachment(:file).options[:service_name]
  end

  test "tunnel clips live under their own prefix of the shared bucket" do
    settings = { "OBJECT_STORAGE_ENDPOINT" => "https://fsn1.example.test", "OBJECT_STORAGE_REGION" => "fsn1",
      "OBJECT_STORAGE_BUCKET" => "sillage-production", "OBJECT_STORAGE_ACCESS_KEY_ID" => "key",
      "OBJECT_STORAGE_SECRET_ACCESS_KEY" => "secret" }
    previous = ENV.to_h.slice(*settings.keys)
    ENV.update(settings)

    configurations = ActiveSupport::ConfigurationFile.parse(Rails.root.join("config/storage.yml"))
    service = ActiveStorage::Service.configure(:tunnel_videos, configurations)

    assert_instance_of ActiveStorage::Service::PrefixedS3Service, service
    assert_equal "sillage-production", service.bucket.name
    assert_equal "https://fsn1.example.test", service.client.client.config.endpoint.to_s
    assert_equal "tunnel-videos/abc123", service.send(:object_for, "abc123").key
    assert_match %r{/tunnel-videos/abc123\?}, service.url("abc123", expires_in: 60, filename: ActiveStorage::Filename.new("clip.mp4"),
      disposition: :inline, content_type: "video/mp4")
  ensure
    settings.each_key { |key| previous.key?(key) ? ENV[key] = previous[key] : ENV.delete(key) }
  end
end
