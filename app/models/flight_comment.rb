class FlightComment < ApplicationRecord
  MAX_LENGTH = 4_000

  belongs_to :flight
  belongs_to :user

  validates :body, presence: true
  validates :body, length: { maximum: MAX_LENGTH }, if: :will_save_change_to_body?
  before_update :record_edit, if: :will_save_change_to_body?

  scope :chronological, -> { order(:created_at, :id) }

  def owned_by?(person)
    person.present? && user_id == person.id
  end

  private

  def record_edit
    self.edited_at = Time.current
  end
end
