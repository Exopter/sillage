require "test_helper"

class Core::FeedbacksControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup do
    @feedback = users(:operator).feedbacks.create!(category: "idea", description: "An annotated idea")
    @feedback.screenshot.attach(io: file_fixture("feedback.png").open, filename: "feedback.png", content_type: "image/png")
  end

  test "non-admins cannot list or update feedback even their own" do
    sign_in_as users(:operator)
    get core_feedbacks_path
    assert_redirected_to root_path
    patch core_feedback_path(@feedback), params: { feedback: { status: "resolved" } }
    assert_redirected_to root_path
    assert_equal "new", @feedback.reload.status
    get root_path
    assert_select "a[href='#{core_feedbacks_path}']", count: 0
  end

  test "screenshots cannot be read by their author or an unauthenticated visitor" do
    get attachment_path(@feedback.screenshot.attachment)
    assert_redirected_to new_session_path
    sign_in_as users(:operator)
    get attachment_path(@feedback.screenshot.attachment)
    assert_response :not_found
  end

  test "admins can read feedback and screenshots and update status" do
    sign_in_as users(:julien)
    get core_feedbacks_path
    assert_response :success
    assert_match @feedback.description, response.body
    assert_select "img[src='#{attachment_path(@feedback.screenshot.attachment)}']"
    get attachment_path(@feedback.screenshot.attachment)
    assert_response :success
    assert_equal "image/png", response.media_type
    assert_match "no-store", response.headers["Cache-Control"]
    patch core_feedback_path(@feedback), params: { feedback: { status: "reviewing", description: "Do not overwrite" } }
    assert_redirected_to core_feedbacks_path
    assert_equal "reviewing", @feedback.reload.status
    assert_equal "An annotated idea", @feedback.description
  end

  test "admins cannot save an unsupported status" do
    sign_in_as users(:julien)
    patch core_feedback_path(@feedback), params: { feedback: { status: "unsupported" } }
    assert_redirected_to core_feedbacks_path
    assert_equal "new", @feedback.reload.status
  end

  test "board groups all statuses and paginates each column independently" do
    sign_in_as users(:julien)
    20.times { |index| users(:operator).feedbacks.create!(category: "idea", description: "New idea #{index}") }
    planned = users(:operator).feedbacks.create!(category: "bug", description: "Planned fix", status: "planned")

    get core_feedbacks_path
    assert_response :success
    assert_select ".exds-kanban-column", count: 4
    assert_select ".exds-kanban select, .exds-kanban input[type='submit']", count: 0
    assert_select "#feedback-#{planned.id} button[draggable='true'][aria-label='Move feedback ##{planned.id}']", count: 1
    assert_select "#feedback-#{planned.id} form[hidden] input[type='hidden'][name='feedback[status]'][value='planned']", count: 1
    assert_select "[data-status='new'] .exds-kanban-card", count: 20
    assert_select "[data-status='new'] .exds-kanban-heading span", text: "21"
    assert_select "[data-status='planned'] #feedback-#{planned.id}", count: 1
    assert_select "[data-status='reviewing'] .exds-kanban-empty", count: 1

    get core_feedbacks_path(pages: { new: 2 })
    assert_select "[data-status='new'] #feedback-#{@feedback.id}", count: 1
    assert_select "[data-status='new'] .exds-kanban-card", count: 1
    assert_select "[data-status='planned'] #feedback-#{planned.id}", count: 1

    assert_enqueued_emails 1 do
      patch core_feedback_path(@feedback), params: { feedback: { status: "resolved" } }
    end
    follow_redirect!
    assert_select "[data-status='resolved'] #feedback-#{@feedback.id}", count: 1
    assert_select "[data-status='new'] #feedback-#{@feedback.id}", count: 0
  end
end
