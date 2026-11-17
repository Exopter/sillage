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
    understood = read_checklist(client, transcript) if debrief.checklist.present?
    debrief.with_lock do
      debrief.checklist = DebriefChecklist.settle(debrief.checklist, transcript, understood) if debrief.checklist.present?
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

  # One retry: a checklist left to the live guesses is worse than a few more seconds.
  def read_checklist(client, transcript)
    attempts = 0
    begin
      client.checklist(transcript)
    rescue Debriefs::OpenAi::Error
      retry if (attempts += 1) < 2
    end
  end

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
