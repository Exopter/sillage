class UserMailer < ApplicationMailer
  def invitation(user)
    @user = user
    mail(to: @user.email_address, subject: "Your Sillage invitation")
  end
end
