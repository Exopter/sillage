class FlightDebriefJob < ApplicationJob
  def perform(id)
    debrief = FlightDebrief.find(id)
    claimed = debrief.with_lock do
      next false unless debrief.status == "uploaded"
      debrief.update!(status: "processing", error_message: nil)
      true
    end
    return unless claimed

    client = Debriefs::OpenAi.new
    transcript = debrief.transcript.presence || client.transcribe(debrief.audio)
    debrief.update!(transcript:)
    summary = client.summarize(transcript)
    debrief.with_lock { debrief.update!(transcript:, summary:, status: "ready") }
  rescue Debriefs::OpenAi::Error, ActiveRecord::RecordInvalid => error
    debrief&.update!(status: "failed", error_message: error.message.first(500))
  end
end
