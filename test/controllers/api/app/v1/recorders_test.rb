require "test_helper"

module Api
  module App
    module V1
      class RecordersTest < ActionDispatch::IntegrationTest
        DEVICE_ID = "ECU-A1B2C3D4E5F6".freeze

        setup do
          Rails.cache.clear
          @user = users(:operator)
          @token = AppToken.issue!(user: @user).token
        end

        test "a member claims, confirms, lists, renames and unlinks a Lite" do
          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID.downcase }, headers: bearer, as: :json

          assert_response :created
          claim_id = response.parsed_body.fetch("claim_id")
          key = Base64.urlsafe_decode64(response.parsed_body.fetch("key"))
          assert_equal 32, key.bytesize
          assert_not_includes response.parsed_body["key"], "="
          controller = EmbeddedController.find_by!(device_id: DEVICE_ID)
          assert_not controller.initialized?

          post confirm_api_app_v1_recorder_claim_path(claim_id), params: { name: "Helmet" }, headers: bearer, as: :json

          assert_response :success
          recorder = response.parsed_body
          assert_equal({ "device_id" => DEVICE_ID, "name" => "Helmet", "model" => "lite" }, recorder.slice("device_id", "name", "model"))
          assert_equal key, controller.reload.fdr_auth_key
          assert controller.initialized?
          assert_nil RecorderClaim.find_by!(token: claim_id).key_ciphertext
          assert_equal "app_linked", controller.device_activities.first.event_type

          # A retried confirmation returns the same recorder.
          post confirm_api_app_v1_recorder_claim_path(claim_id), params: { name: "Other" }, headers: bearer, as: :json
          assert_response :success
          assert_equal recorder["id"], response.parsed_body["id"]

          get api_app_v1_recorders_path, headers: bearer, as: :json
          assert_equal [ recorder["id"] ], response.parsed_body["recorders"].pluck("id")

          patch api_app_v1_recorder_path(recorder["id"]), params: { name: "  Arm pocket " }, headers: bearer, as: :json
          assert_response :success
          assert_equal "Arm pocket", response.parsed_body["name"]

          patch api_app_v1_recorder_path(recorder["id"]), params: { name: "x" * 65 }, headers: bearer, as: :json
          assert_response :unprocessable_entity

          delete api_app_v1_recorder_path(recorder["id"]), headers: bearer

          assert_response :no_content
          assert_not controller.reload.initialized?
          assert_nil controller.fdr_auth_key
          assert_equal "app_unlinked", controller.device_activities.first.event_type
          get api_app_v1_recorders_path, headers: bearer, as: :json
          assert_empty response.parsed_body["recorders"]

          # Once unlinked, the recorder can be claimed again.
          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, headers: bearer, as: :json
          assert_response :created
        end

        test "an owned recorder cannot be claimed and another account cannot see it" do
          ownership = link!(@user)
          other = AppToken.issue!(user: users(:julien)).token

          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, headers: bearer(other), as: :json
          assert_response :conflict
          assert_equal "already_owned", response.parsed_body["error"]

          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, headers: bearer, as: :json
          assert_response :conflict

          get api_app_v1_recorders_path, headers: bearer(other), as: :json
          assert_empty response.parsed_body["recorders"]

          patch api_app_v1_recorder_path(ownership), params: { name: "Mine" }, headers: bearer(other), as: :json
          assert_response :not_found
          delete api_app_v1_recorder_path(ownership), headers: bearer(other)
          assert_response :not_found
          put api_app_v1_recorder_recording_path(ownership, 1), params: "x", headers: upload_headers("x", other)
          assert_response :not_found
          assert ownership.reload.unlinked_at.nil?
        end

        test "a recorder initialized outside the app cannot be claimed" do
          EmbeddedController.create!(device_id: DEVICE_ID).install_fdr_auth_key!(SecureRandom.random_bytes(32))

          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, headers: bearer, as: :json

          assert_response :conflict
        end

        test "the first confirmation wins and an unconfirmed claim expires after ten minutes" do
          other = AppToken.issue!(user: users(:julien)).token
          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, headers: bearer, as: :json
          mine = response.parsed_body["claim_id"]
          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, headers: bearer(other), as: :json
          theirs = response.parsed_body["claim_id"]

          post confirm_api_app_v1_recorder_claim_path(theirs), headers: bearer(other), as: :json
          assert_response :success
          assert_equal "Lite D4E5F6", response.parsed_body["name"]

          post confirm_api_app_v1_recorder_claim_path(mine), headers: bearer, as: :json
          assert_response :conflict

          post confirm_api_app_v1_recorder_claim_path(theirs), headers: bearer, as: :json
          assert_response :not_found

          post api_app_v1_recorder_claims_path, params: { device_id: "ECU-0000000000AA" }, headers: bearer, as: :json
          late = response.parsed_body["claim_id"]
          travel 10.minutes + 1.second do
            post confirm_api_app_v1_recorder_claim_path(late), headers: bearer, as: :json
          end
          assert_response :gone
          assert_equal "claim_expired", response.parsed_body["error"]
        end

        test "claims need a full Lite identifier and a token" do
          post api_app_v1_recorder_claims_path, params: { device_id: "ECU-A1B2C3" }, headers: bearer, as: :json
          assert_response :unprocessable_entity
          assert_equal "invalid_device_id", response.parsed_body["error"]

          post api_app_v1_recorder_claims_path, params: {}, headers: bearer, as: :json
          assert_response :bad_request

          post api_app_v1_recorder_claims_path, params: { device_id: DEVICE_ID }, as: :json
          assert_response :unauthorized
          assert_empty RecorderClaim.all
        end

        test "an upload is checked, stored as received, queued once and deduplicated" do
          ownership = link!(@user)
          body = Random.bytes(3_000).b

          assert_enqueued_with(job: LiteRecordingImportJob) do
            put api_app_v1_recorder_recording_path(ownership, 0x2A), params: body, headers: upload_headers(body)
          end

          assert_response :created
          assert_equal({ "status" => "accepted", "sha256" => Digest::SHA256.hexdigest(body), "flight_code" => nil }, response.parsed_body)
          upload = ownership.lite_recording_uploads.sole
          assert_equal [ 42, 3_000, "LITE_0000002A.BIN" ], [ upload.file_id, upload.byte_size, upload.original.filename.to_s ]
          assert_equal body, upload.original.download

          assert_no_enqueued_jobs do
            put api_app_v1_recorder_recording_path(ownership, 0x2A), params: body, headers: upload_headers(body)
          end
          assert_response :success
          assert_equal "duplicate", response.parsed_body["status"]
          assert_equal 1, LiteRecordingUpload.count

          perform_enqueued_jobs { LiteRecordingImportJob.perform_later(upload) }
          assert_equal "awaiting_decoder", upload.reload.status
          get api_app_v1_recorders_path, headers: bearer, as: :json
          assert_equal upload.created_at.iso8601, response.parsed_body.dig("recorders", 0, "last_seen_at")
        end

        test "an upload with a wrong digest, size or file id is refused" do
          ownership = link!(@user)
          body = "recording".b

          put api_app_v1_recorder_recording_path(ownership, 1), params: body,
            headers: upload_headers(body).merge("X-Content-SHA256" => Digest::SHA256.hexdigest("other"))
          assert_response :unprocessable_entity
          assert_equal "digest_mismatch", response.parsed_body["error"]

          put api_app_v1_recorder_recording_path(ownership, 1), params: body,
            headers: upload_headers(body).merge("X-Content-SHA256" => "zz")
          assert_equal "invalid_digest", response.parsed_body["error"]

          put api_app_v1_recorder_recording_path(ownership, 1), params: body,
            headers: upload_headers(body).merge("CONTENT_LENGTH" => "4")
          assert_response :unprocessable_entity
          assert_equal "size_mismatch", response.parsed_body["error"]

          put api_app_v1_recorder_recording_path(ownership, 2**32), params: body, headers: upload_headers(body)
          assert_equal "invalid_file_id", response.parsed_body["error"]

          assert_empty LiteRecordingUpload.all
          assert_empty ActiveStorage::Blob.all
        end

        private

        def link!(user)
          controller = EmbeddedController.find_or_create_by!(device_id: DEVICE_ID)
          claim, = RecorderClaim.open!(user:, embedded_controller: controller)
          claim.confirm!(name: "Helmet")
        end

        def bearer(token = @token)
          { "Authorization" => "Bearer #{token}" }
        end

        def upload_headers(body, token = @token)
          bearer(token).merge(
            "Content-Type" => "application/octet-stream",
            "X-Content-SHA256" => Digest::SHA256.hexdigest(body)
          )
        end
      end
    end
  end
end
