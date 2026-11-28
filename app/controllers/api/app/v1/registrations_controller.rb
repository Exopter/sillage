module Api
  module App
    module V1
      # Open sign-up from the mobile app. New accounts get the `user` role: they see
      # their own flights and what other pilots share with them.
      class RegistrationsController < BaseController
        skip_before_action :authenticate_app_token
        rate_limit to: 5, within: 10.minutes, by: -> { request.remote_ip }, with: -> { render_rate_limited }

        def create
          email = params.require(:email).to_s.strip.downcase
          if User.exists?(email_address: email)
            return render_error :conflict, "email_taken",
              "An account already exists for this email address. Sign in, or open your invitation email."
          end

          user = User.new(
            email_address: email,
            first_name: params[:first_name],
            last_name: params[:last_name],
            password: params[:password].to_s,
            role: "user",
            invitation_accepted_at: Time.current
          )
          user.validate
          # Names are optional for invited users but shown on every shared flight.
          user.errors.add(:first_name, :blank) if user.first_name.blank?
          user.errors.add(:last_name, :blank) if user.last_name.blank?
          if user.errors.any?
            return render_error :unprocessable_entity, "invalid_account", user.errors.full_messages.to_sentence,
              fields: user.errors.attribute_names.map(&:to_s).uniq
          end

          user.save!
          token = AppToken.issue!(user:, device_name: params[:device_name])
          render json: { token: token.token, account: account_payload(user) }, status: :created
        rescue ActiveRecord::RecordNotUnique
          render_error :conflict, "email_taken", "An account already exists for this email address. Sign in instead."
        end

        private

        def render_rate_limited
          render_error :too_many_requests, "rate_limited", "Too many sign-ups from this network. Try again in a few minutes."
        end
      end
    end
  end
end
