class FlightDebrief < ApplicationRecord
  belongs_to :flight
  belongs_to :user
  belongs_to :flight_comment, optional: true
  has_one_attached :audio

  # Body of the Pilot log entry between the end of the recording and the summary.
  PENDING_SUMMARY = "Audio debrief recorded. The summary is being written."

  def summary_pending?
    status.in?(%w[uploaded processing])
  end

  # The Pilot log entry exists as soon as the audio is stored; the summary replaces its body later.
  def publish_entry!(author)
    return flight_comment if flight_comment

    comment = flight.comments.create!(user: author, body: summary.presence || PENDING_SUMMARY)
    update!(flight_comment: comment)
    comment
  end
  validates :uuid, presence: true, uniqueness: true
  validates :status, inclusion: { in: %w[recording uploaded processing ready failed published] }
  validates :summary, length: { maximum: 4_000 }
  validates :transcript, length: { maximum: 200_000 }
end
