require "test_helper"

class FlightCommentImagesTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @owner = users(:julien)
    @viewer = users(:operator)
    @flight = flights(:one)
    @flight.update!(visibility: "team")
    sign_in_as @owner
  end

  test "multiple images render through authorized URLs and text edits retain them" do
    comment = create_comment(images: [ image_upload, image_upload ])
    original_ids = comment.images.pluck(:id)
    assert_equal 2, original_ids.size
    follow_redirect!
    assert_select "form[enctype='multipart/form-data']"
    assert_select ".exds-comment-images img[loading='lazy']", count: 2
    assert_select ".exds-comment-images a[target='_blank']", count: 2
    get attachment_path(comment.images.first)
    assert_response :success
    assert_equal "image/png", response.media_type
    assert_match(/inline/, response.headers["Content-Disposition"])
    assert_includes response.headers["Cache-Control"], "no-store"
    assert_equal file_fixture("feedback.png").binread, response.body

    patch flight_comment_path(@flight, comment), params: { flight_comment: { body: "Updated observation", images: [ "" ] } }
    assert_response :see_other
    assert_equal original_ids, comment.reload.images.pluck(:id)
    patch flight_comment_path(@flight, comment), params: { flight_comment: { body: comment.body, images: [ image_upload ] } }
    assert_response :see_other
    assert_equal 3, comment.reload.images.count
    assert_empty original_ids - comment.images.pluck(:id)
  end

  test "image removal marks the comment edited and purges only the removed file" do
    comment = create_comment(images: [ image_upload, image_upload ])
    removed, retained = comment.images.to_a
    blob = removed.blob
    created_at = comment.created_at
    get edit_flight_comment_path(@flight, comment)
    assert_select "input[name='flight_comment[remove_image_ids][]']", count: 2
    perform_enqueued_jobs(only: ActiveStorage::PurgeJob) do
      patch flight_comment_path(@flight, comment), params: { flight_comment: { body: comment.body, remove_image_ids: [ removed.id ] } }
    end
    assert_response :see_other
    assert_equal [ retained.id ], comment.reload.images.pluck(:id)
    assert comment.edited_at
    assert_equal created_at, comment.created_at
    assert_not ActiveStorage::Blob.exists?(blob.id)
    assert_not blob.service.exist?(blob.key)
    get attachment_path(removed.id)
    assert_response :not_found
  end

  test "failed edits preserve saved images and body without storing new uploads" do
    comment = create_comment(images: [ image_upload ])
    original = comment.images.sole
    assert_no_difference [ "ActiveStorage::Blob.count", "ActiveStorage::Attachment.count" ] do
      patch flight_comment_path(@flight, comment), params: { flight_comment: { body: " ", images: [ image_upload ], remove_image_ids: [ original.id ] } }
    end
    assert_response :unprocessable_entity
    assert_select "[role='alert']"
    assert_select "input[name='flight_comment[remove_image_ids][]'][checked]", count: 1
    assert_includes response.body, "Please select new images again"
    assert_equal "Test observation", comment.reload.body
    assert_equal [ original.id ], comment.images.pluck(:id)
    assert original.blob.service.exist?(original.blob.key)
    assert_nil comment.edited_at
  end

  test "invalid formats spoofed content signed blob IDs and upload limits are rejected" do
    private_blob = flights(:two).video.attach(io: StringIO.new("private video"), filename: "private.mp4", content_type: "video/mp4").blob
    spoofed = Rack::Test::UploadedFile.new(file_fixture("flight_exit_gps_recovery.csv"), "image/png", original_filename: "fake.png")
    large = Tempfile.new([ "oversized-comment", ".png" ])
    large.binmode
    large.write(file_fixture("feedback.png").binread)
    large.truncate(FlightComment::MAX_IMAGE_SIZE + 1)
    large.close
    oversized = Rack::Test::UploadedFile.new(large.path, "image/png")
    [ [ spoofed ], [ private_blob.signed_id ], [ oversized ], Array.new(FlightComment::MAX_IMAGES + 1) { image_upload } ].each do |uploads|
      assert_no_difference [ "FlightComment.count", "ActiveStorage::Attachment.count", "ActiveStorage::Blob.count" ] do
        post flight_comments_path(@flight), params: { flight_comment: { body: "Invalid upload", images: uploads } }
      end
      assert_response :unprocessable_entity
      assert_select "[role='alert']"
    end
  ensure
    large&.unlink
  end

  test "image access follows flight access and only the author may change images" do
    comment = create_comment(images: [ image_upload ])
    image = comment.images.sole
    sign_in_as @viewer
    get attachment_path(image)
    assert_response :success
    patch flight_comment_path(@flight, comment), params: { flight_comment: { body: "Forbidden", remove_image_ids: [ image.id ] } }
    assert_response :not_found
    viewer_comment = create_comment(images: [ image_upload ])
    sign_in_as @owner
    patch flight_comment_path(@flight, viewer_comment), params: { flight_comment: { body: "Forbidden", images: [ image_upload ] } }
    assert_response :not_found
    patch flight_comment_path(@flight, comment), params: { flight_comment: { body: "Wrong image", remove_image_ids: [ viewer_comment.images.sole.id ] } }
    assert_response :not_found
    assert_equal "Test observation", comment.reload.body
    assert_equal 1, comment.images.count

    folder = @owner.flight_folders.create!(name: "Image review", visibility: "shared", members: [ @viewer ])
    @flight.update!(folder:)
    sign_in_as @viewer
    get attachment_path(image)
    assert_response :success
    folder.memberships.destroy_all
    [ image, viewer_comment.images.sole ].each do |attachment|
      get attachment_path(attachment)
      assert_response :not_found
    end
    delete logout_path
    get attachment_path(image)
    assert_redirected_to new_session_path
  end

  test "comment and flight deletion remove attachments and stored images" do
    comment = create_comment(images: [ image_upload ])
    blob = comment.images.sole.blob
    perform_enqueued_jobs(only: ActiveStorage::PurgeJob) do
      delete flight_comment_path(@flight, comment)
    end
    assert_response :see_other
    assert_not ActiveStorage::Blob.exists?(blob.id)
    assert_not blob.service.exist?(blob.key)

    comment = create_comment(images: [ image_upload ])
    blob = comment.images.sole.blob
    perform_enqueued_jobs(only: PurgeFlightDataJob) do
      delete flight_path(@flight)
    end
    assert_not FlightComment.exists?(comment.id)
    assert_not ActiveStorage::Attachment.exists?(record: comment)
    assert_not ActiveStorage::Blob.exists?(blob.id)
    assert_not blob.service.exist?(blob.key)
  end

  test "new flights save their first comment and images together or reject everything" do
    attributes = { flown_on: "2026-10-20", location: "Bouloc", initial_comment: "First observation", initial_comment_images: [ image_upload ] }
    assert_difference [ "Flight.count", "FlightComment.count", "ActiveStorage::Attachment.count" ] do
      post flights_path, params: { flight: attributes }
    end
    assert_response :redirect
    flight = @owner.flights.order(:id).last
    assert_equal "First observation", flight.comments.sole.body
    assert_equal file_fixture("feedback.png").binread, flight.comments.sole.images.sole.download
    assert_no_difference [ "Flight.count", "FlightComment.count", "ActiveStorage::Attachment.count", "ActiveStorage::Blob.count" ] do
      post flights_path, params: { flight: attributes.merge(initial_comment: "", initial_comment_images: [ image_upload ]) }
    end
    assert_response :unprocessable_entity
    assert_select "input[type='file'][name='flight[initial_comment_images][]']"
  end

  private

  def image_upload
    fixture_file_upload("feedback.png", "image/png")
  end

  def create_comment(images:)
    post flight_comments_path(@flight), params: { flight_comment: { body: "Test observation", images: } }
    assert_response :see_other
    @flight.comments.order(:id).last
  end
end
