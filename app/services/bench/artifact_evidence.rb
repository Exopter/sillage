require "digest"

module Bench
  class ArtifactEvidence
    def initialize(manifest, uploads)
      raise ArgumentError, "Every declared artifact must be uploaded" unless manifest.is_a?(Array) && uploads.size == manifest.size

      @manifest = manifest
      @uploads = uploads
      paths = manifest.map { |artifact| artifact.fetch("path") }
      unless paths.uniq.size == paths.size && paths.all? { |path| path.is_a?(String) && path.match?(/\A[^\\\r\n]+\z/) && !path.start_with?("/") && !path.split("/").include?("..") }
        raise ArgumentError, "Invalid or duplicate artifact path"
      end
      manifest.zip(uploads).each do |artifact, upload|
        unless upload.original_filename == File.basename(artifact.fetch("path")) &&
            upload.size == artifact.fetch("size") && Digest::SHA256.file(upload.tempfile.path).hexdigest == artifact.fetch("sha256")
          raise ArgumentError, "Artifact does not match its manifest: #{artifact.fetch('path')}"
        end
      end
    end

    def attach_to(test_run)
      @manifest.zip(@uploads).each do |artifact, upload|
        next if matching_blob(test_run, artifact, verify: test_run.persisted?)
        raise ArgumentError, "Validated evidence is incomplete; review is required" if test_run.validated?

        test_run.artifacts.attach(io: upload.tempfile, filename: upload.original_filename,
          content_type: upload.content_type, metadata: { artifact_path: artifact.fetch("path") })
      end
    end

    def receipt(test_run)
      @manifest.each do |artifact|
        raise ArgumentError, "Stored evidence is incomplete: #{artifact.fetch('path')}" unless matching_blob(test_run, artifact, verify: true)
      end
      @manifest
    end

    private

    def matching_blob(test_run, artifact, verify:)
      test_run.artifacts.blobs.find do |blob|
        next unless blob.metadata["artifact_path"] == artifact.fetch("path") && blob.byte_size == artifact.fetch("size")
        next true unless verify

        blob.open { |file| Digest::SHA256.file(file.path).hexdigest == artifact.fetch("sha256") }
      rescue ActiveStorage::FileNotFoundError, ActiveStorage::IntegrityError
        false
      end
    end
  end
end
