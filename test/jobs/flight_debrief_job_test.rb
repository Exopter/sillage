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
    client.define_singleton_method(:transcribe) { |_| raise "Must reuse the complete live transcript" }
    replace_method(Debriefs::OpenAi, :new, -> { client }) do
      2.times { FlightDebriefJob.perform_now(record.id) }
    end
    assert_equal [ "A stable flight." ], calls
    assert_equal "ready", record.reload.status
    assert_equal "Stable flight.", record.summary
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
