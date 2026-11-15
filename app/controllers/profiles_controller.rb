class ProfilesController < ApplicationController
  before_action :set_user

  def show
  end

  def update
    attributes = params.require(:user).permit(:first_name, :last_name, :avatar, :remove_avatar)
    upload = attributes.delete(:avatar)
    remove_avatar = ActiveModel::Type::Boolean.new.cast(attributes.delete(:remove_avatar))
    @user.assign_attributes(attributes)

    if upload.present?
      unless upload.is_a?(ActionDispatch::Http::UploadedFile)
        @user.errors.add(:avatar, "must be an uploaded image file")
        return render :show, status: :unprocessable_entity
      end

      content_type = Marcel::MimeType.for(upload.tempfile)
      upload.tempfile.rewind
      @user.avatar = { io: upload.tempfile, filename: upload.original_filename, content_type:, identify: false }
    end

    if @user.save
      @user.avatar.purge_later if remove_avatar && upload.blank?
      redirect_to profile_path, notice: "Profile updated.", status: :see_other
    else
      render :show, status: :unprocessable_entity
    end
  end

  private

  def set_user
    @user = Current.user
  end
end
