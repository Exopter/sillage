module Api
  module App
    module V1
      module Recorders
        # First claim of a Lite recorder. The app opens a claim, installs the
        # returned key on the recorder during its pairing window, then confirms.
        class ClaimsController < BaseController
          LITE_DEVICE_ID = /\AECU-[0-9A-F]{12}\z/

          rate_limit to: 20, within: 10.minutes, by: -> { current_user.id }, only: :create,
            with: -> { render_error :too_many_requests, "rate_limited", "Too many attempts. Try again in a few minutes." }

          rescue_from RecorderClaim::Conflict do
            render_error :conflict, "already_owned", "This recorder already belongs to an account."
          end

          def create
            device_id = FdrIdentity::DeviceId.normalize(params.require(:device_id))
            unless device_id.to_s.match?(LITE_DEVICE_ID)
              return render_error :unprocessable_entity, "invalid_device_id", "Use the full identifier, ECU- and 12 hexadecimal digits."
            end

            claim, key = RecorderClaim.open!(user: current_user, embedded_controller: find_or_create_controller(device_id))
            render json: {
              claim_id: claim.token,
              key: Base64.urlsafe_encode64(key, padding: false),
              expires_at: claim.expires_at.iso8601
            }, status: :created
          end

          def confirm
            claim = current_user.recorder_claims.find_by(token: params[:claim_id])
            return render_error :not_found, "not_found", "This claim does not exist." unless claim

            ownership = claim.confirm!(name: params[:name])
            render json: recorder_payload(ownership)
          rescue RecorderClaim::Expired
            render_error :gone, "claim_expired", "This claim has expired. Link the recorder again."
          rescue ActiveRecord::RecordInvalid
            render_error :unprocessable_entity, "invalid_name", "Use a name of 1 to #{RecorderOwnership::NAME_LENGTH.max} characters."
          end

          private

          def find_or_create_controller(device_id)
            EmbeddedController.find_or_create_by!(device_id:)
          rescue ActiveRecord::RecordNotUnique
            EmbeddedController.find_by!(device_id:)
          end
        end
      end
    end
  end
end
