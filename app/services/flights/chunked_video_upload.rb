require "fileutils"

module Flights
  # Receives a video in chunks small enough for the CDN request limit. Chunks live on the storage
  # volume, so an upload resumes after a dropped connection, a reload or a deployment.
  class ChunkedVideoUpload
    class Error < StandardError; end
    class Incomplete < Error; end

    CHUNK_SIZE = 8.megabytes
    MAX_BYTE_SIZE = 4.gigabytes
    RETENTION = 24.hours
    ID_FORMAT = /\A[0-9a-f]{32}\z/

    attr_reader :id

    def self.root
      Rails.root.join(Rails.env.test? ? "tmp/storage/video_uploads" : "storage/video_uploads")
    end

    def self.start(flight:, user:, filename:, content_type:, byte_size:, last_modified:)
      byte_size = Integer(byte_size.to_s, 10, exception: false).to_i
      filename = File.basename(filename.to_s)
      raise Error, "The video is empty." unless byte_size.positive?
      raise Error, "The video exceeds the 4 GB limit." if byte_size > MAX_BYTE_SIZE
      raise Error, "Choose a video file." unless Flight.video_file?(content_type:, filename:)

      id = Digest::SHA256.hexdigest([ user.id, flight.id, filename, byte_size, last_modified ].join("\0")).first(32)
      upload = new(flight:, id:)
      FileUtils.rm_rf(upload.directory) if upload.manifest&.fetch("completed", false)
      upload.create_manifest(user:, filename:, content_type:, byte_size:) unless upload.manifest
      upload
    end

    def self.find(flight:, user:, id:)
      raise ActiveRecord::RecordNotFound unless id.to_s.match?(ID_FORMAT)

      upload = new(flight:, id: id.to_s)
      raise ActiveRecord::RecordNotFound unless upload.manifest&.fetch("user_id", nil) == user.id

      upload
    end

    def self.sweep(now: Time.current)
      Dir.glob(root.join("*", "*")).each do |path|
        FileUtils.rm_rf(path) if File.directory?(path) && last_activity(path) < now - RETENTION
      end
    end

    def self.last_activity(path)
      Dir.children(path).map { |name| File.mtime(File.join(path, name)) }.max || File.mtime(path)
    rescue Errno::ENOENT
      Time.current
    end
    private_class_method :last_activity

    def initialize(flight:, id:)
      @flight = flight
      @id = id
    end

    def directory
      self.class.root.join(@flight.id.to_s, id)
    end

    def manifest
      @manifest ||= JSON.parse(File.read(manifest_path))
    rescue Errno::ENOENT
      nil
    end

    def create_manifest(user:, filename:, content_type:, byte_size:)
      FileUtils.mkdir_p(directory)
      @manifest = { "user_id" => user.id, "filename" => filename, "content_type" => content_type.to_s,
                    "byte_size" => byte_size, "chunk_size" => CHUNK_SIZE }
      write_manifest
    end

    def chunk_size = manifest.fetch("chunk_size")

    def chunk_count = (manifest.fetch("byte_size").to_f / chunk_size).ceil

    def received
      Dir.children(directory).filter_map { |name| name[/\Achunk-(\d+)\z/, 1]&.to_i }.sort
    end

    def write_chunk(index, io)
      index = Integer(index.to_s, 10, exception: false)
      raise Error, "Unknown video chunk." unless index && index >= 0 && index < chunk_count

      expected = index == chunk_count - 1 ? manifest.fetch("byte_size") - (chunk_count - 1) * chunk_size : chunk_size
      partial = directory.join("partial-#{index}-#{SecureRandom.hex(4)}")
      written = IO.copy_stream(io, partial.to_s, expected + 1)
      raise Error, "The video chunk has the wrong size." unless written == expected

      File.rename(partial, chunk_path(index))
    ensure
      FileUtils.rm_f(partial) if partial
    end

    # Safe to repeat: a client that lost the response gets the same success.
    def complete
      File.open(directory.join("lock"), File::CREAT | File::RDWR) do |lock|
        lock.flock(File::LOCK_EX)
        @manifest = nil
        return if manifest["completed"]

        missing = (0...chunk_count).to_a - received
        raise Incomplete, "#{missing.size} video chunks are missing." if missing.any?

        assemble { |file| yield file, manifest.fetch("filename"), manifest.fetch("content_type").presence }
        manifest["completed"] = true
        write_manifest
        Dir.glob(directory.join("chunk-*")).each { |path| FileUtils.rm_f(path) }
      end
    end

    private

    def assemble
      path = directory.join("assembled")
      File.open(path, "wb") do |output|
        chunk_count.times { |index| IO.copy_stream(chunk_path(index).to_s, output) }
      end
      File.open(path, "rb") { |file| yield file }
    ensure
      FileUtils.rm_f(path)
    end

    def chunk_path(index) = directory.join("chunk-#{index}")

    def manifest_path = directory.join("manifest.json")

    def write_manifest
      temporary = directory.join("manifest-#{SecureRandom.hex(4)}")
      File.write(temporary, manifest.to_json)
      File.rename(temporary, manifest_path)
    end
  end
end
