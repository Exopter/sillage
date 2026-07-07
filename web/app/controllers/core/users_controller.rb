module Core
  class UsersController < BaseController
    before_action :set_user, only: %i[edit update resend_invitation disable enable reset_two_factor]

    def index
      @users = User.order(:email_address)
      @user = User.new(role: "user")
    end

    def create
      @user = User.invite!(email_address: user_params[:email_address], role: user_params[:role])
      redirect_to core_users_path, notice: "Invitation sent to #{@user.email_address}."
    rescue ActiveRecord::RecordInvalid => error
      @users = User.order(:email_address)
      @user = error.record
      flash.now[:alert] = @user.errors.full_messages.to_sentence
      render :index, status: :unprocessable_entity
    end

    def edit
    end

    def update
      if demoting_last_active_admin?
        redirect_to edit_core_user_path(@user), alert: "At least one active admin is required."
      elsif @user.update(user_params.slice(:role))
        redirect_to core_users_path, notice: "User updated."
      else
        flash.now[:alert] = @user.errors.full_messages.to_sentence
        render :edit, status: :unprocessable_entity
      end
    end

    def resend_invitation
      if @user.invitation_pending?
        @user.send_invitation!
        redirect_to core_users_path, notice: "Invitation resent to #{@user.email_address}."
      else
        redirect_to core_users_path, alert: "This user has already accepted their invitation."
      end
    end

    def disable
      if @user == Current.user
        redirect_to core_users_path, alert: "You cannot disable your own account."
      elsif last_active_admin?(@user)
        redirect_to core_users_path, alert: "At least one active admin is required."
      else
        @user.update!(disabled_at: Time.current)
        @user.sessions.destroy_all
        redirect_to core_users_path, notice: "User disabled."
      end
    end

    def enable
      @user.update!(disabled_at: nil)
      redirect_to core_users_path, notice: "User enabled."
    end

    def reset_two_factor
      @user.reset_totp!
      redirect_to core_users_path, notice: "Two-factor authentication reset."
    end

    private

    def set_user
      @user = User.find(params[:id])
    end

    def user_params
      params.require(:user).permit(:email_address, :role)
    end

    def demoting_last_active_admin?
      @user.admin? && user_params[:role] != "admin" && last_active_admin?(@user)
    end

    def last_active_admin?(user)
      user.admin? && !user.disabled? && User.active.admins.where.not(id: user.id).none?
    end
  end
end
