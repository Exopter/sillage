require "active_storage/service/s3_service"

module ActiveStorage
  # S3 service that keeps its objects under one key prefix, so several kinds of
  # files can share a bucket and stay separable for lifecycle rules and listings.
  class Service::PrefixedS3Service < Service::S3Service
    attr_reader :prefix

    def initialize(prefix:, **options)
      @prefix = prefix.to_s.delete_prefix("/").delete_suffix("/")
      raise ArgumentError, "A storage prefix is required" if @prefix.empty?

      super(**options)
    end

    def delete_prefixed(prefix)
      instrument :delete_prefixed, prefix: prefix do
        bucket.objects(prefix: "#{@prefix}/#{prefix}").batch_delete!
      end
    end

    private

    def object_for(key)
      bucket.object("#{@prefix}/#{key}")
    end
  end
end
