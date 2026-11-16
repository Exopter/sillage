class InvitationsController < ApplicationController
  layout -> { @user&.member? ? "flight_club" : "authentication" }
  allow_unauthenticated_access only: %i[edit update]

  skip_before_action :present_membership_welcome
  before_action :set_user_by_token
  before_action :route_existing_account

  def edit
  end

  def update
    if @user.accept_invitation!(password: params[:password], password_confirmation: params[:password_confirmation])
      start_new_session_for(@user)
      if @user.totp_required?
        redirect_to new_two_factor_setup_path, notice: "Invitation accepted."
      elsif @user.member?
        redirect_to flight_club_welcome_path
      else
        redirect_to after_authentication_url, notice: "Invitation accepted."
      end
    else
      flash.now[:alert] = @user.errors.full_messages.to_sentence
      render :edit, status: :unprocessable_entity
    end
  end

  private

  def route_existing_account
    return if @user.invitation_pending?

    destination = @user.awaiting_membership_welcome? ? flight_club_welcome_path : root_path
    if resume_session&.user == @user
      redirect_to destination
    else
      session[:return_to_after_authenticating] = destination
      redirect_to new_session_path, notice: "Your account already exists. Sign in with your current password to continue."
    end
  end

  def set_user_by_token
    @user = User.find_by_token_for!(:invitation, params[:token])
    redirect_to new_session_path, alert: "This account is disabled." if @user.disabled?
  rescue ActiveSupport::MessageVerifier::InvalidSignature, ActiveRecord::RecordNotFound
    redirect_to new_session_path, alert: "Invitation link is invalid or has expired."
  end
end
