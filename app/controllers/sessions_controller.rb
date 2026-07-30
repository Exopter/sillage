class SessionsController < ApplicationController
  layout "authentication"
  allow_unauthenticated_access only: %i[new create]

  def new
  end

  def create
    user = User.find_by(email_address: params[:email_address].to_s.strip.downcase)

    if user&.active_for_authentication? && user.authenticate(params[:password])
      start_new_session_for(user)
      redirect_to session_start_redirect_path(user), notice: "Signed in."
    else
      redirect_to new_session_path, alert: "Try another email address or password."
    end
  end

  def destroy
    terminate_session
    redirect_to new_session_path, notice: "Signed out.", status: :see_other
  end

  private

  def session_start_redirect_path(user)
    return new_two_factor_setup_path if user.totp_required? && !user.totp_configured?
    return new_two_factor_challenge_path if user.totp_required?

    after_authentication_url
  end
end
