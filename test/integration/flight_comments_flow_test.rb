require "test_helper"

class FlightCommentsFlowTest < ActionDispatch::IntegrationTest
  setup do
    @owner = users(:julien)
    @viewer = users(:operator)
    @flight = flights(:one)
    @flight.update!(visibility: "team")
    sign_in_as @owner
  end

  test "create edit and delete retain the original author and creation date" do
    assert_difference "FlightComment.count" do
      post flight_comments_path(@flight), params: { flight_comment: { body: "Opening\nStable", user_id: @viewer.id, flight_id: flights(:two).id, created_at: 1.year.ago } }, headers: frame_headers
    end
    comment = @flight.comments.sole
    assert_equal @owner, comment.user
    assert_nil comment.edited_at
    timestamp = comment.created_at
    follow_redirect!
    assert_select "turbo-frame#comments_flight_#{@flight.id}"
    assert_select ".exds-comment-body" do |elements|
      assert_equal "Opening\nStable", elements.first.text
    end
    assert_select "[role='status']", text: "Comment posted."
    assert_equal "no-store", response.headers["Cache-Control"]
    get edit_flight_comment_path(@flight, comment), headers: frame_headers
    assert_select "textarea[name='flight_comment[body]']", text: "Opening\nStable"
    travel 1.minute do
      patch flight_comment_path(@flight, comment), params: { flight_comment: { body: "Changed", user_id: @viewer.id } }, headers: frame_headers
    end
    assert_equal "Changed", comment.reload.body
    assert_equal timestamp, comment.created_at
    assert_equal @owner, comment.user
    assert comment.edited_at
    assert_difference "FlightComment.count", -1 do
      delete flight_comment_path(@flight, comment), headers: frame_headers
    end
    follow_redirect!
    assert_select ".exds-comments-empty"
  end

  test "viewers comment but cannot alter another author's comments including admins" do
    owner_comment = @flight.comments.create!(user: @owner, body: "Owner comment")
    sign_in_as @viewer
    post flight_comments_path(@flight), params: { flight_comment: { body: "Viewer comment" } }
    assert_response :see_other
    viewer_comment = @flight.comments.order(:id).last
    assert_equal @viewer, viewer_comment.user
    get flight_comments_path(@flight)
    assert_select ".exds-comment-actions", count: 1
    get edit_flight_comment_path(@flight, owner_comment)
    assert_response :not_found
    patch flight_comment_path(@flight, owner_comment), params: { flight_comment: { body: "Forbidden" } }
    assert_response :not_found
    delete flight_comment_path(@flight, owner_comment)
    assert_response :not_found
    sign_in_as @owner
    delete flight_comment_path(@flight, viewer_comment)
    assert_response :not_found
    assert_equal "Owner comment", owner_comment.reload.body
  end

  test "private flights and revoked folder access protect every comment endpoint" do
    folder = @owner.flight_folders.create!(name: "Comments campaign", visibility: "shared", members: [ @viewer ])
    @flight.update!(folder:)
    comment = @flight.comments.create!(user: @viewer, body: "Member comment")
    sign_in_as @viewer
    get flight_comments_path(@flight)
    assert_response :success
    folder.memberships.destroy_all
    [ flight_comments_path(@flight), edit_flight_comment_path(@flight, comment) ].each do |path|
      get path
      assert_response :not_found
    end
    post flight_comments_path(@flight), params: { flight_comment: { body: "Forbidden" } }
    assert_response :not_found
    patch flight_comment_path(@flight, comment), params: { flight_comment: { body: "Forbidden" } }
    assert_response :not_found
    delete flight_comment_path(@flight, comment)
    assert_response :not_found
    @flight.update!(folder: nil, visibility: "private")
    get flight_comments_path(@flight)
    assert_response :not_found
    assert_equal "Member comment", comment.reload.body
  end

  test "blank and oversized text is rejected while HTML renders as text" do
    [ nil, " \n\t", "a" * 4_001 ].each do |body|
      assert_no_difference "FlightComment.count" do
        post flight_comments_path(@flight), params: { flight_comment: { body: } }, headers: frame_headers
      end
      assert_response :unprocessable_entity
      assert_select "[role='alert']"
      assert_select "textarea[name='flight_comment[body]']", text: body.to_s
    end
    comment = @flight.comments.create!(user: @owner, body: '<script>alert("x")</script>')
    get flight_comments_path(@flight)
    assert_select ".exds-comment-body script", count: 0
    assert_select ".exds-comment-body", text: comment.body
    patch flight_comment_path(@flight, comment), params: { flight_comment: { body: " " } }, headers: frame_headers
    assert_response :unprocessable_entity
    assert_equal '<script>alert("x")</script>', comment.reload.body
  end

  test "nested ids cannot modify comments on another flight and guests must sign in" do
    comment = flights(:two).comments.create!(user: @owner, body: "Other flight")
    delete flight_comment_path(@flight, comment)
    assert_response :not_found
    delete logout_path
    get flight_comments_path(@flight)
    assert_redirected_to new_session_path
    post flight_comments_path(@flight), params: { flight_comment: { body: "Guest" } }
    assert_redirected_to new_session_path
  end

  test "search includes comments once and no longer returns deleted or stale notes" do
    @flight.update!(notes: "Obsolete private note")
    comments = 2.times.map { @flight.comments.create!(user: @owner, body: "Distinct observation") }
    get flights_path(q: "Distinct observation")
    assert_select ".exds-browser-entry-copy strong", text: @flight.code, count: 1
    comments.each { |comment| delete flight_comment_path(@flight, comment) }
    get flights_path(q: "Distinct observation")
    assert_select ".exds-browser-entry-copy strong", count: 0
    get flights_path(q: "Obsolete private note")
    assert_select ".exds-browser-entry-copy strong", count: 0
    patch flight_path(@flight), params: { flight: { notes: "No longer writable" } }
    assert_equal "Obsolete private note", @flight.reload.notes
  end

  test "a new flight saves its optional first comment atomically and deletion removes comments" do
    assert_difference "FlightComment.count" do
      post flights_path, params: { flight: { flown_on: "2026-10-19", location: "Bouloc", initial_comment: "First observation" } }
    end
    flight = @owner.flights.order(:id).last
    assert_equal "First observation", flight.comments.sole.body
    assert_equal @owner, flight.comments.sole.user
    assert_nil flight.notes
    assert_no_difference [ "Flight.count", "FlightComment.count" ] do
      post flights_path, params: { flight: { flown_on: "2026-10-19", location: "Bouloc", initial_comment: "x" * 4_001 } }
    end
    assert_response :unprocessable_entity
    assert_difference "FlightComment.count", -1 do
      delete flight_path(flight)
    end
  end

  private

  def frame_headers
    { "Turbo-Frame" => "comments_flight_#{@flight.id}" }
  end
end
