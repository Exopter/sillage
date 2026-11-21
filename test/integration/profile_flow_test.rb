require "test_helper"

class ProfileFlowTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  setup do
    @member = users(:member)
    @member.complete_membership_welcome!
    sign_in_as @member
  end

  test "the member profile keeps the card and overlays the rank on the avatar" do
    get profile_path
    assert_response :success
    assert_select "h1", "Elias Okafor"
    assert_select "#membership [data-membership-card-tier-value='explorer']"
    assert_select ".sillage-avatar-insignia[src*='insignia-explorer']", count: 3
    assert_select "form[enctype='multipart/form-data']"
    assert_select "[data-controller='avatar-crop'] input[type='file'][data-avatar-crop-target='input']"
    assert_select "[data-avatar-crop-target='preview'] .sillage-avatar--large"
    assert_select "dialog.sillage-avatar-dialog .sillage-avatar-stage[tabindex='0'] img[data-avatar-crop-target='image']"
    assert_select "dialog.sillage-avatar-dialog input[type='range'][min='1'][max='4']"
    assert_select "dialog.sillage-avatar-dialog button[type='button']", count: 4
    assert_select ".sillage-avatar-photo", count: 0
  end

  test "a pilot adds, reads and edits their own wing settings" do
    get profile_path
    assert_select "#wing-settings .sillage-wing-settings-empty a[href='#{profile_path(edit: "wing-settings", anchor: "wing-settings")}']", text: "Add your settings"
    assert_select "#wing-settings .sillage-wing-settings", count: 0

    get profile_path(edit: "wing-settings")
    assert_select "#wing-settings form input[name='section'][value='wing_settings']"
    assert_select "#wing-settings input[name='user[tunnel_glide_ratio]'][min='1.49'][max='3.98']"
    assert_select "#wing-settings .exds-form-actions a[href='#{profile_path(anchor: "wing-settings")}']", text: "Cancel"

    patch profile_path, params: { section: "wing_settings",
      user: { weight_kg: "68", height_cm: "172", cg_setting: "", tunnel_glide_ratio: "2.99", tunnel_speed_kmh: "165", role: "admin" } }
    assert_redirected_to profile_path(anchor: "wing-settings")
    @member.reload
    assert_equal [ 68, 172, nil, BigDecimal("2.99"), 165 ], User::WING_SETTINGS.map { |setting| @member[setting] }
    assert_equal "user", @member.role
    assert @member.wing_settings_updated_at

    get profile_path
    assert_select "#wing-settings .sillage-profile-panel-header a", text: "Edit"
    assert_select "#wing-settings .sillage-wing-settings > div", count: 5
    assert_select "#wing-settings .sillage-wing-settings dd", text: /\A68\s*kg\z/
    assert_select "#wing-settings .sillage-wing-settings dd", text: "2.99"
    assert_select "#wing-settings .sillage-wing-settings dd.is-unset", count: 1
    assert_select "#wing-settings .sillage-wing-settings-note", text: /Updated #{Time.current.strftime("%-d %B %Y")}/
  end

  test "an out of range wing setting keeps the form open with the error" do
    patch profile_path, params: { section: "wing_settings", user: { tunnel_glide_ratio: "9", weight_kg: "68" } }
    assert_response :unprocessable_entity
    assert_select "#wing-settings .workspace-errors", text: /Tunnel glide ratio/
    assert_select "#wing-settings input[name='user[weight_kg]'][value='68']"
    assert_select ".sillage-profile-form .workspace-errors", count: 0
    assert_nil @member.reload.weight_kg
  end

  test "a read-only member can upload replace and remove their own photo" do
    patch profile_path, params: { user: { avatar: image_upload, first_name: "Eli", role: "admin", membership_tier: "trailblazer" } }
    assert_redirected_to profile_path
    assert_equal "Eli", @member.reload.first_name
    assert_equal "user", @member.role
    assert_equal "explorer", @member.membership_tier
    original = @member.avatar.attachment
    get profile_path
    assert_response :success
    assert_select ".sillage-avatar-photo[src='#{attachment_path(original)}']", count: 3

    sign_in_as users(:operator)
    get attachment_path(original)
    assert_response :success
    assert_equal "image/png", response.media_type
    assert_match(/inline/, response.headers["Content-Disposition"])
    assert_includes response.headers["Cache-Control"], "no-store"
    assert_equal file_fixture("feedback.png").binread, response.body
    delete logout_path
    get attachment_path(original)
    assert_redirected_to new_session_path

    sign_in_as @member
    perform_enqueued_jobs(only: ActiveStorage::PurgeJob) do
      patch profile_path, params: { user: { avatar: image_upload } }
    end
    assert_not_equal original.id, @member.reload.avatar.attachment.id
    assert_not ActiveStorage::Blob.exists?(original.blob_id)

    perform_enqueued_jobs(only: ActiveStorage::PurgeJob) do
      patch profile_path, params: { user: { remove_avatar: "1" } }
    end
    assert_redirected_to profile_path
    assert_not @member.reload.avatar.attached?
    get profile_path
    assert_select ".sillage-avatar-photo", count: 0
    assert_select ".sillage-avatar-insignia", count: 3
  end

  test "invalid uploads and validation failures preserve the saved photo" do
    @member.avatar.attach(io: file_fixture("feedback.png").open, filename: "avatar.png", content_type: "image/png")
    original_id = @member.avatar.attachment.id
    spoofed = Rack::Test::UploadedFile.new(file_fixture("flight_exit_gps_recovery.csv"), "image/png", original_filename: "fake.png")
    oversized = Tempfile.new([ "oversized-avatar", ".png" ])
    oversized.binmode
    oversized.write(file_fixture("feedback.png").binread)
    oversized.truncate(User::MAX_AVATAR_SIZE + 1)
    oversized.close

    [ spoofed, @member.avatar.blob.signed_id, Rack::Test::UploadedFile.new(oversized.path, "image/png") ].each do |upload|
      assert_no_difference [ "ActiveStorage::Blob.count", "ActiveStorage::Attachment.count" ] do
        patch profile_path, params: { user: { avatar: upload } }
      end
      assert_response :unprocessable_entity
      assert_select "[role='alert']"
      assert_equal original_id, @member.reload.avatar.attachment.id
    end
    patch profile_path, params: { user: { first_name: "", remove_avatar: "1" } }
    assert_response :unprocessable_entity
    assert_equal original_id, @member.reload.avatar.attachment.id
  ensure
    oversized&.unlink
  end

  test "ordinary accounts have a profile without a card or rank" do
    sign_in_as users(:operator)
    get profile_path
    assert_response :success
    assert_select ".sillage-account-action[href='#{profile_path}']", "My profile"
    assert_select "#membership", count: 0
    assert_select ".sillage-avatar-insignia", count: 0
    patch profile_path, params: { user: { avatar: image_upload } }
    assert_redirected_to profile_path
    assert users(:operator).reload.avatar.attached?
  end

  private

  def image_upload
    fixture_file_upload("feedback.png", "image/png")
  end
end
