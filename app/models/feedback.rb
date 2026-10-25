class Feedback < ApplicationRecord
  CATEGORIES = { "idea" => "Idea", "bug" => "Problem" }.freeze
  STATUSES = %w[new reviewing planned resolved].freeze

  belongs_to :user
  has_one_attached :screenshot
  normalizes :description, with: ->(value) { value.strip }
  validates :category, inclusion: { in: CATEGORIES.keys }
  validates :status, inclusion: { in: STATUSES }
  validates :description, presence: true, length: { maximum: 5000 }
  validates :page_path, length: { maximum: 500 }, format: { with: %r{\A/(?!/)[^?\#\s]*\z} }, allow_blank: true
  validate :screenshot_format
  after_update_commit :notify_author_of_status_change, if: :saved_change_to_status?

  private

  def notify_author_of_status_change
    FeedbackMailer.status_changed(self, previous_status: status_before_last_save, status: status).deliver_later
  end

  def screenshot_format
    return unless screenshot.attached?

    errors.add(:screenshot, "must be a PNG image") unless screenshot.blob.content_type == "image/png"
    errors.add(:screenshot, "must be smaller than 8 MB") if screenshot.blob.byte_size > 8.megabytes
  end
end
