module Flights
  # Lets the browser send a video straight to object storage as a multipart upload. Sillage only
  # signs the parts, so large files bypass the CDN body limit and the application server. Storage
  # remembers received parts, so an upload resumes after a dropped connection or a reload.
  class DirectVideoUpload
    class Error < StandardError; end
    class Incomplete < Error; end

    PART_SIZE = 8.megabytes
    MAX_BYTE_SIZE = 4.gigabytes
    MAX_SIGNED_PARTS = 16
    URL_LIFETIME = 1.hour
    RETENTION = 24.hours
    ID_FORMAT = /\A[0-9a-f]{40}\z/

    attr_reader :blob

    def self.service_name = Rails.configuration.x.flight_video_direct_service&.to_s

    def self.enabled? = service_name.present?

    def self.start(flight:, user:, filename:, content_type:, byte_size:, last_modified:)
      byte_size = Integer(byte_size.to_s, 10, exception: false).to_i
      filename = File.basename(filename.to_s)
      raise Error, "The video is empty." unless byte_size.positive?
      raise Error, "The video exceeds the 4 GB limit." if byte_size > MAX_BYTE_SIZE
      raise Error, "Choose a video file." unless Flight.video_file?(content_type:, filename:)

      key = Digest::SHA256.hexdigest([ user.id, flight.id, filename, byte_size, last_modified ].join("\0")).first(40)
      blob = ActiveStorage::Blob.find_by(key:) || create_blob(key:, flight:, user:, filename:, content_type:, byte_size:)
      new(flight:, blob:)
    end

    def self.find(flight:, user:, id:)
      raise ActiveRecord::RecordNotFound unless id.to_s.match?(ID_FORMAT)

      blob = ActiveStorage::Blob.find_by!(key: id.to_s, service_name:)
      owner = blob.custom_metadata
      raise ActiveRecord::RecordNotFound unless owner["user_id"] == user.id && owner["flight_id"] == flight.id

      new(flight:, blob:)
    end

    def self.sweep(now: Time.current)
      return unless enabled?

      ActiveStorage::Blob.unattached.where(service_name:, created_at: ...(now - RETENTION)).find_each do |blob|
        new(flight: nil, blob:).abort
        blob.purge
      end
    end

    def self.create_blob(key:, flight:, user:, filename:, content_type:, byte_size:)
      service = ActiveStorage::Blob.services.fetch(service_name)
      content_type = content_type.presence || "application/octet-stream"
      upload = service.client.client.create_multipart_upload(
        bucket: service.bucket.name, key: service.object_key(key), content_type:
      )
      ActiveStorage::Blob.create!(
        key:, filename:, content_type:, byte_size:, service_name:, checksum: nil,
        metadata: { composed: true, custom: { upload_id: upload.upload_id, user_id: user.id, flight_id: flight.id } }
      )
    end
    private_class_method :create_blob

    def initialize(flight:, blob:)
      @flight = flight
      @blob = blob
    end

    def id = blob.key

    def part_size = PART_SIZE

    def part_count = (blob.byte_size.to_f / part_size).ceil

    def received
      return (1..part_count).to_a if completed?

      stored_parts.select { |part| part.size == expected_size(part.part_number) }.map(&:part_number)
    end

    def sign(numbers)
      numbers = Array(numbers).map { |number| Integer(number.to_s, 10, exception: false) }.uniq
      raise Error, "Unknown video part." if numbers.empty? || numbers.size > MAX_SIGNED_PARTS || numbers.any? { |number| !number&.between?(1, part_count) }

      presigner = Aws::S3::Presigner.new(client:)
      numbers.index_with do |number|
        presigner.presigned_url(:upload_part, bucket:, key: object_key, upload_id:, part_number: number, expires_in: URL_LIFETIME.to_i)
      end
    end

    # Safe to repeat: a client that lost the response gets the same success.
    def complete
      blob.with_lock { finish_multipart unless completed? }
      QueueVideoProcessing.attach(flight: @flight, blob:)
    end

    def abort
      return if completed? || upload_id.blank?

      client.abort_multipart_upload(bucket:, key: object_key, upload_id:)
    rescue Aws::S3::Errors::NoSuchUpload
      nil
    end

    private

    def finish_multipart
      parts = stored_parts.select { |part| part.size == expected_size(part.part_number) }
      missing = part_count - parts.size
      raise Incomplete, "#{missing} video parts are missing." if missing.positive?

      client.complete_multipart_upload(
        bucket:, key: object_key, upload_id:,
        multipart_upload: { parts: parts.map { |part| { part_number: part.part_number, etag: part.etag } } }
      )
      blob.custom_metadata = blob.custom_metadata.merge("completed" => true)
      blob.save!
    end

    def stored_parts
      parts = []
      marker = nil
      loop do
        page = client.list_parts(bucket:, key: object_key, upload_id:, part_number_marker: marker)
        parts.concat(page.parts)
        break unless page.is_truncated

        marker = page.next_part_number_marker
      end
      parts
    end

    def expected_size(number)
      number == part_count ? blob.byte_size - (part_count - 1) * part_size : part_size
    end

    def completed? = blob.custom_metadata["completed"] == true

    def upload_id = blob.custom_metadata["upload_id"]

    def service = blob.service

    def client = service.client.client

    def bucket = service.bucket.name

    def object_key = service.object_key(blob.key)
  end
end
