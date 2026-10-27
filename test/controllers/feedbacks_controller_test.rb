require "test_helper"

class FeedbacksControllerTest < ActionDispatch::IntegrationTest
  test "requires authentication to submit" do
    post feedbacks_path, params: { feedback: { category: "idea", description: "A suggestion" } }
    assert_redirected_to new_session_path
  end

  test "saves feedback for the signed in user and ignores forged ownership and status" do
    sign_in_as_admin users(:operator)
    assert_difference "Feedback.count", 1 do
      post feedbacks_path, as: :json, params: { feedback: {
        category: "bug", description: "The flight view is blank.", page_path: "/flights",
        user_id: users(:julien).id, status: "resolved"
      } }
    end
    assert_response :created
    assert_equal true, response.parsed_body["saved"]
    assert_equal users(:operator), Feedback.last.user
    assert_equal "new", Feedback.last.status
  end

  test "invalid feedback reports validation errors without saving" do
    sign_in_as_admin users(:operator)
    assert_no_difference "Feedback.count" do
      post feedbacks_path, as: :json, params: { feedback: { category: "question", description: "Keep my thought" } }
    end
    assert_response :unprocessable_entity
    assert_includes response.parsed_body["errors"], "Category is not included in the list"
  end

  test "composer offers only ideas and problems" do
    sign_in_as_admin users(:operator)
    get new_feedback_path(page_path: "/signal")
    assert_response :success
    assert_select "input[name='feedback[page_path]'][value='/signal']"
    assert_select "input[type=radio]", count: 2
    assert_select "input[value=idea][checked]"
    assert_select "input[value=bug]"
    assert_select "button", text: "Annotate page"
  end

  test "saves a PNG screenshot with its feedback" do
    sign_in_as_admin users(:operator)
    assert_difference "Feedback.count", 1 do
      post feedbacks_path, headers: { "Accept" => "application/json" }, params: { feedback: {
        category: "idea", description: "See the highlighted area", page_path: "/flights",
        screenshot: fixture_file_upload("feedback.png", "image/png")
      } }
    end
    assert_response :created
    assert Feedback.last.screenshot.attached?
    assert_equal "image/png", Feedback.last.screenshot.blob.content_type
    assert_equal file_fixture("feedback.png").binread, Feedback.last.screenshot.download
  end

  test "rejects unsupported screenshot files and signed blob references" do
    sign_in_as_admin users(:operator)
    assert_no_difference "Feedback.count" do
      post feedbacks_path, headers: { "Accept" => "application/json" }, params: { feedback: {
        category: "bug", description: "Not an image", screenshot: fixture_file_upload("sample.mp4", "video/mp4")
      } }
    end
    assert_response :unprocessable_entity
    assert_match "PNG", response.parsed_body["errors"].join
    assert_no_difference "Feedback.count" do
      post feedbacks_path, as: :json, params: { feedback: { category: "idea", description: "Existing blob", screenshot: "signed-blob-id" } }
    end
    assert_response :unprocessable_entity
  end

  test "old inbox and update routes no longer exist" do
    assert_raises(ActionController::RoutingError) { Rails.application.routes.recognize_path("/feedbacks", method: :get) }
    assert_raises(ActionController::RoutingError) { Rails.application.routes.recognize_path("/feedbacks/1", method: :patch) }
  end
end
