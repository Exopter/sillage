require "test_helper"
require_relative "../../support/method_replacement"

class Debriefs::OpenAiTest < ActiveSupport::TestCase
  include MethodReplacement

  test "the live session carries keyword hints and survives their rejection" do
    client = Debriefs::OpenAi.new
    sent = []
    client.define_singleton_method(:request) { |path, body| sent << [ path, body ]; { "value" => "secret" } }
    assert_equal({ "value" => "secret" }, client.realtime)
    transcription = sent.sole.last.dig(:session, :audio, :input, :transcription)
    assert_equal "gpt-live-transcribe", transcription[:model]
    assert_includes transcription[:keywords], "glide ratio"
    assert_includes transcription[:keywords], "angle of attack"

    sent.clear
    client.define_singleton_method(:request) do |path, body|
      sent << body
      raise Debriefs::OpenAi::Error, "OpenAI request failed (400)" if body.dig(:session, :audio, :input, :transcription).key?(:keywords)

      { "value" => "plain" }
    end
    assert_equal({ "value" => "plain" }, client.realtime)
    assert_equal 2, sent.size
  end

  test "file transcription sends context and hints, then retries bare when they are refused" do
    record = FlightDebrief.create!(flight: flights(:one), user: users(:julien), uuid: SecureRandom.uuid)
    record.audio.attach(io: StringIO.new("audio"), filename: "debrief.webm", content_type: "audio/webm")
    client = Debriefs::OpenAi.new
    calls = []
    client.define_singleton_method(:transcription) { |fields| calls << fields.map(&:first); "Glide ratio 4.0." }
    assert_equal "Glide ratio 4.0.", client.transcribe(record.audio)
    assert_equal %w[model file prompt], calls.sole.first(3)
    assert_includes calls.sole, "keywords[]"

    calls.clear
    client.define_singleton_method(:transcription) do |fields|
      calls << fields.size
      raise Debriefs::OpenAi::Error, "OpenAI request failed (400)" if fields.size > 2

      "Plain text."
    end
    assert_equal "Plain text.", client.transcribe(record.audio)
    assert_equal 2, calls.last
  end
end
