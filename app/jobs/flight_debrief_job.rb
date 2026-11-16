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
    transcript = final_transcript(debrief, client)
    debrief.update!(transcript:)
    summary = client.summarize(transcript)
    understood = if debrief.checklist.present?
      begin
        DebriefChecklist.extract(transcript).merge(client.checklist(transcript))
      rescue Debriefs::OpenAi::Error
        DebriefChecklist.extract(transcript)
      end
    end
    debrief.with_lock do
      # The whole recording is read more accurately than the live stream, so its values win;
      # the phone keeps what only it knows: the pilot and the points ticked by hand.
      debrief.checklist = debrief.checklist.merge(understood) if debrief.checklist.present?
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

  private

  # The live stream starts a moment after the recording and loses the first words,
  # so the stored audio is transcribed whenever it exists. The live text is the fallback.
  def final_transcript(debrief, client)
    live = debrief.transcript.presence
    return live if live && !debrief.audio.attached?

    client.transcribe(debrief.audio)
  rescue Debriefs::OpenAi::Error
    live || raise
  end
end
