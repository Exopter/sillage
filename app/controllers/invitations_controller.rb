class InvitationsController < ApplicationController
  layout "authentication"
  allow_unauthenticated_access only: %i[edit update]

  before_action :set_user_by_token

  def edit
  end

  def update
    if @user.accept_invitation!(password: params[:password], password_confirmation: params[:password_confirmation])
      start_new_session_for(@user)
      redirect_to(@user.totp_required? ? new_two_factor_setup_path : after_authentication_url, notice: "Invitation accepted.")
    else
      flash.now[:alert] = @user.errors.full_messages.to_sentence
      render :edit, status: :unprocessable_entity
    end
  end

  private

  def set_user_by_token
    @user = User.find_by_token_for!(:invitation, params[:token])
    redirect_to new_session_path, alert: "This account is disabled." if @user.disabled?
  rescue ActiveSupport::MessageVerifier::InvalidSignature, ActiveRecord::RecordNotFound
    redirect_to new_session_path, alert: "Invitation link is invalid or has expired."
  end
end
