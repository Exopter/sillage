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
    debrief.with_lock do
      # Points ticked on the phone win; the full transcript fills the ones it missed.
      debrief.checklist = DebriefChecklist.extract(transcript).merge(debrief.checklist) if debrief.checklist.present?
      comment = debrief.flight_comment
      if comment
        # Fill the entry published at upload time, unless its author has already rewritten it.
        comment.update_columns(body: summary, updated_at: Time.current) if comment.body == FlightDebrief::PENDING_SUMMARY
        debrief.update!(transcript:, summary:, status: "published")
      else
        debrief.update!(transcript:, summary:, status: "ready")
      end
    end
  rescue Debriefs::OpenAi::Error, ActiveRecord::RecordInvalid => error
    debrief&.update!(status: "failed", error_message: error.message.first(500))
  end
end
