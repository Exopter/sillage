require "test_helper"
require_relative "../support/method_replacement"

class FlightDebriefJobTest < ActiveSupport::TestCase
  include MethodReplacement

  test "summarizes the final live transcript only once" do
    record = FlightDebrief.create!(flight: flights(:one), user: users(:julien), uuid: SecureRandom.uuid,
      status: "uploaded", transcript: "A stable flight.")
    client = Object.new
    calls = []
    client.define_singleton_method(:summarize) { |text| calls << text; "Stable flight." }
    client.define_singleton_method(:checklist) { |_| {} }
    client.define_singleton_method(:transcribe) { |_| raise "Must reuse the complete live transcript" }
    replace_method(Debriefs::OpenAi, :new, -> { client }) do
      2.times { FlightDebriefJob.perform_now(record.id) }
    end
    assert_equal [ "A stable flight." ], calls
    assert_equal "ready", record.reload.status
    assert_equal "Stable flight.", record.summary
  end

  test "fills the published Pilot log entry and keeps an entry its author rewrote" do
    client = Object.new
    client.define_singleton_method(:summarize) { |_| "I held a steady glide." }
    client.define_singleton_method(:checklist) { |_| {} }
    client.define_singleton_method(:transcribe) { |_| "Spoken words." }
    records = 2.times.map do
      record = FlightDebrief.create!(flight: flights(:one), user: users(:julien), uuid: SecureRandom.uuid, status: "uploaded")
      record.publish_entry!(users(:julien))
      record
    end
    records.last.flight_comment.update!(body: "My own notes.")
    replace_method(Debriefs::OpenAi, :new, -> { client }) { records.each { |record| FlightDebriefJob.perform_now(record.id) } }

    assert_equal %w[published published], records.map { |record| record.reload.status }
    assert_equal "I held a steady glide.", records.first.flight_comment.reload.body
    assert_nil records.first.flight_comment.edited_at
    assert_equal "My own notes.", records.last.flight_comment.reload.body
    assert_equal "I held a steady glide.", records.last.summary
  end

  test "completes the checklist from the model, with word patterns when the model is unavailable" do
    client = Object.new
    client.define_singleton_method(:summarize) { |_| "I held a steady glide." }
    client.define_singleton_method(:transcribe) { |_| "We were gliding at three. Speed 165." }
    client.define_singleton_method(:checklist) { |_| { "glide_ratio" => "3", "speed" => "165 km/h" } }
    understood = FlightDebrief.create!(flight: flights(:one), user: users(:julien), uuid: SecureRandom.uuid, status: "uploaded", checklist: { "pilot" => "Julien", "speed" => "170 km/h" })
    replace_method(Debriefs::OpenAi, :new, -> { client }) { FlightDebriefJob.perform_now(understood.id) }
    # The reading of the whole recording wins; the phone keeps what only it knows.
    assert_equal({ "pilot" => "Julien", "speed" => "165 km/h", "glide_ratio" => "3" }, understood.reload.checklist)

    client.define_singleton_method(:checklist) { |_| raise Debriefs::OpenAi::Error, "Temporarily unavailable" }
    fallback = FlightDebrief.create!(flight: flights(:one), user: users(:julien), uuid: SecureRandom.uuid, status: "uploaded", checklist: { "pilot" => "Julien" })
    replace_method(Debriefs::OpenAi, :new, -> { client }) { FlightDebriefJob.perform_now(fallback.id) }
    assert_equal({ "pilot" => "Julien", "speed" => "165 km/h" }, fallback.reload.checklist)
  end

  test "reads the checklist of a debrief that arrived without one" do
    # FLT-2026-111: the audio was resent by a reopened page, with no ticks from the phone.
    client = Object.new
    client.define_singleton_method(:summarize) { |_| "Summary." }
    client.define_singleton_method(:transcribe) { |_| "Glide ratio 3, vitesse 150." }
    client.define_singleton_method(:checklist) { |_| { "glide_ratio" => "3", "speed" => "150 km/h" } }
    record = FlightDebrief.create!(flight: flights(:one), user: users(:julien), uuid: SecureRandom.uuid, status: "uploaded")
    record.audio.attach(io: StringIO.new("audio"), filename: "debrief.webm", content_type: "audio/webm")
    replace_method(Debriefs::OpenAi, :new, -> { client }) { FlightDebriefJob.perform_now(record.id) }
    assert_equal({ "glide_ratio" => "3", "speed" => "150 km/h" }, record.reload.checklist)
  end

  test "transcribes the stored recording even when a live transcript exists, and falls back to it" do
    client = Object.new
    client.define_singleton_method(:summarize) { |text| text }
    client.define_singleton_method(:checklist) { |_| {} }
    client.define_singleton_method(:transcribe) { |_| "Glide ratio 4.0, speed 150." }
    build = lambda do
      record = FlightDebrief.create!(flight: flights(:one), user: users(:julien), uuid: SecureRandom.uuid, status: "uploaded", transcript: "Three 4.0 speed one five zero")
      record.audio.attach(io: StringIO.new("audio"), filename: "debrief.webm", content_type: "audio/webm")
      record
    end
    full = build.call
    replace_method(Debriefs::OpenAi, :new, -> { client }) { FlightDebriefJob.perform_now(full.id) }
    assert_equal "Glide ratio 4.0, speed 150.", full.reload.transcript

    client.define_singleton_method(:transcribe) { |_| raise Debriefs::OpenAi::Error, "Temporarily unavailable" }
    live = build.call
    replace_method(Debriefs::OpenAi, :new, -> { client }) { FlightDebriefJob.perform_now(live.id) }
    assert_equal "Three 4.0 speed one five zero", live.reload.transcript
    assert_equal "ready", live.status
  end

  test "retains the transcript when summarization fails" do
    record = FlightDebrief.create!(flight: flights(:one), user: users(:julien), uuid: SecureRandom.uuid, status: "uploaded")
    client = Object.new
    client.define_singleton_method(:transcribe) { |_| "Original spoken words." }
    client.define_singleton_method(:summarize) { |_| raise Debriefs::OpenAi::Error, "Temporarily unavailable" }
    replace_method(Debriefs::OpenAi, :new, -> { client }) { FlightDebriefJob.perform_now(record.id) }
    assert_equal "failed", record.reload.status
    assert_equal "Original spoken words.", record.transcript
  end
end
