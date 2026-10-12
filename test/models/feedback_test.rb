require "test_helper"

class FeedbackTest < ActiveSupport::TestCase
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
