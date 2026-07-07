class PasswordsController < ApplicationController
  layout "authentication"
  allow_unauthenticated_access

  before_action :set_user_by_token, only: %i[edit update]

  def new
  end

  def create
    if (user = User.find_by(email_address: params[:email_address].to_s.strip.downcase))
      PasswordsMailer.reset(user).deliver_later if user.active_for_authentication?
    end

    redirect_to new_session_path, notice: "Password reset instructions sent if that account exists."
  end

  def edit
  end

  def update
    if @user.update(password_params)
      @user.sessions.destroy_all
      redirect_to new_session_path, notice: "Password has been reset."
    else
      flash.now[:alert] = @user.errors.full_messages.to_sentence
      render :edit, status: :unprocessable_entity
    end
  end

  private

  def set_user_by_token
    @user = User.find_by_password_reset_token!(params[:token])
    redirect_to new_session_path, alert: "This account is disabled." if @user.disabled?
  rescue ActiveSupport::MessageVerifier::InvalidSignature, ActiveRecord::RecordNotFound
    redirect_to new_password_path, alert: "Password reset link is invalid or has expired."
  end

  def password_params
    params.permit(:password, :password_confirmation)
  end
end
