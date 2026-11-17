class FlightDebrief < ApplicationRecord
  belongs_to :flight
  belongs_to :user
  belongs_to :flight_comment, optional: true
  has_one_attached :audio

  # Body of the Pilot log entry between the end of the recording and the summary.
  PENDING_SUMMARY = "Audio debrief recorded. The summary is being written."

  # How long the audio of a finished recording may take to arrive before the debrief is
  # written from the words heard live. The phone keeps sending; the audio replaces them when it lands.
  AUDIO_GRACE = 10.minutes

  scope :heard_without_audio, -> { where(status: "recording").where.not(transcript: [ nil, "" ]).where(updated_at: ...AUDIO_GRACE.ago) }

  # Publishes the debriefs whose audio has not arrived, from their live transcript.
  def self.publish_heard_without_audio!
    heard_without_audio.find_each do |debrief|
      debrief.with_lock do
        next unless debrief.status == "recording" && debrief.transcript.present? && !debrief.audio.attached?

        debrief.update!(status: "uploaded")
        debrief.publish_entry!(debrief.user)
        FlightDebriefJob.perform_later(debrief.id)
      end
    end
  end

  # A reservation that holds neither audio nor live words.
  def unused?
    !audio.attached? && transcript.blank?
  end

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
