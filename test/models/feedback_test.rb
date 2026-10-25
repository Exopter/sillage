require "test_helper"

class FeedbackTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper

  test "only committed status changes notify the author" do
    feedback = nil
    assert_no_enqueued_emails do
      feedback = users(:operator).feedbacks.create!(category: "idea", description: "Useful feedback")
      feedback.update!(description: "Updated feedback")
      feedback.update!(status: "new")
      assert_not feedback.update(status: "unsupported")
    end
    feedback.reload

    assert_enqueued_email_with FeedbackMailer, :status_changed, args: [ feedback, { previous_status: "new", status: "reviewing" } ] do
      feedback.update!(status: "reviewing")
    end

    assert_no_enqueued_emails do
      Feedback.transaction(requires_new: true) do
        feedback.update!(status: "resolved")
        raise ActiveRecord::Rollback
      end
    end
    assert_equal "reviewing", feedback.reload.status
  end

  test "requires meaningful feedback and valid categories and statuses" do
    feedback = users(:operator).feedbacks.new(category: "bug", description: "   ")
    assert_not feedback.valid?
    feedback.description = "a" * 5001
    assert_not feedback.valid?
    feedback.description = "Useful feedback"
    assert feedback.valid?
    feedback.status = "unsupported"
    assert_not feedback.valid?
  end

  test "page context only accepts a local path without query strings" do
    feedback = users(:operator).feedbacks.new(category: "idea", description: "Useful feedback")
    [ "https://example.com", "//example.com", "/flights?token=secret", "/flights#secret" ].each do |path|
      feedback.page_path = path
      assert_not feedback.valid?, path
    end
    feedback.page_path = "/flights/123"
    assert feedback.valid?
  end
end
