class FlightComment < ApplicationRecord
  MAX_LENGTH = 4_000
  MAX_IMAGES = 10
  MAX_IMAGE_SIZE = 10.megabytes
  IMAGE_TYPES = %w[image/jpeg image/png image/gif image/webp].freeze

  belongs_to :flight
  belongs_to :user
  has_many_attached :images
  attr_reader :removed_image_ids

  validates :body, presence: true
  validates :body, length: { maximum: MAX_LENGTH }, if: :will_save_change_to_body?
  validate :validate_images
  before_update :record_edit, if: -> { will_save_change_to_body? || attachment_changes.key?("images") }

  scope :chronological, -> { order(:created_at, :id) }

  def owned_by?(person)
    person.present? && user_id == person.id
  end

  def assign_images(uploads: [], removal_ids: [])
    uploads = Array(uploads).reject(&:blank?)
    @removed_image_ids = Array(removal_ids).reject(&:blank?).map(&:to_s).uniq
    return if uploads.empty? && removed_image_ids.empty?

    existing = images.attachments.to_a
    unless (removed_image_ids - existing.map { |image| image.id.to_s }).empty?
      raise ActiveRecord::RecordNotFound
    end

    # Accept new multipart files only, never another record's signed blob ID.
    @invalid_image_uploads = uploads.any? { |upload| !upload.is_a?(ActionDispatch::Http::UploadedFile) }
    return if @invalid_image_uploads

    additions = uploads.map do |upload|
      content_type = Marcel::MimeType.for(upload.tempfile)
      upload.tempfile.rewind
      { io: upload.tempfile, filename: upload.original_filename, content_type:, identify: false }
    end
    retained = existing.reject { |image| removed_image_ids.include?(image.id.to_s) }.map(&:blob)
    self.images = retained + additions
  end

  private

  def validate_images
    errors.add(:images, "must be uploaded image files") if @invalid_image_uploads
    errors.add(:images, "cannot exceed #{MAX_IMAGES} per comment") if images.size > MAX_IMAGES
    images.each do |image|
      errors.add(:images, "must be JPEG, PNG, GIF or WebP files") unless IMAGE_TYPES.include?(image.blob.content_type)
      errors.add(:images, "must be 10 MB or smaller each") if image.blob.byte_size > MAX_IMAGE_SIZE
    end
  end

  def record_edit
    self.edited_at = Time.current
  end
end
