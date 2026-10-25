require "test_helper"

class FeedbackMailerTest < ActionMailer::TestCase
  test "delayed emails retain each transition and notify only the author" do
    feedback = users(:operator).feedbacks.create!(category: "idea", description: "Please improve Hangar <script>alert(1)</script>")

    feedback.update!(status: "reviewing")
    feedback.update!(status: "planned")
    perform_enqueued_jobs

    messages = ActionMailer::Base.deliveries.last(2)
    assert_equal 2, messages.size
    messages.zip([ [ "New", "Reviewing" ], [ "Reviewing", "Planned" ] ]).each do |message, (previous_status, status)|
      assert_equal [ users(:operator).email_address ], message.to
      assert_empty Array(message.cc)
      assert_empty Array(message.bcc)
      assert_equal "Your Sillage feedback ##{feedback.id}: #{status}", message.subject
      assert_includes message.text_part.body.decoded, "from #{previous_status} to #{status}"
      assert_includes message.html_part.body.decoded, "Please improve Hangar"
      assert_not_includes message.html_part.body.decoded, "<script>"
      assert_includes message.text_part.body.decoded, "http://www.example.com/"
      assert_not_includes message.html_part.body.decoded, "/core/feedbacks"
    end
  end
end
