module Api
  module App
    module V1
      class AccountsController < BaseController
        rate_limit to: 5, within: 10.minutes, only: :destroy, by: -> { current_user.id }, with: -> {
          render_error :too_many_requests, "rate_limited", "Too many attempts. Try again in a few minutes."
        }

        def show
          render json: account_payload(current_user)
        end

        # Account deletion requested in the app. The password confirms it.
        def destroy
          unless current_user.authenticate(params.require(:password).to_s)
            return render_error :unauthorized, "invalid_password", "This password is not correct."
          end

          Accounts::Deletion.new(current_user).call
          head :no_content
        rescue ActiveJob::EnqueueError
          render_error :service_unavailable, "deletion_failed", "The account could not be deleted. Try again in a moment."
        end
      end
    end
  end
end
