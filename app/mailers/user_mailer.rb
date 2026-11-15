class UserMailer < ApplicationMailer
  def invitation(user)
    @user = user
    @invitation_url = edit_invitation_url(@user.invitation_token)
    return mail(to: @user.email_address, subject: "Your Sillage invitation") unless @user.member?

    @preheader = "Your #{@user.membership_rank} membership is ready. Accept your invitation by #{long_date(@user.invitation_expires_at)}."
    flight_club_mail subject: "#{@user.first_name}, your place in Flight Club is ready", template_name: "flight_club_invitation"
  end

  def membership_confirmation(user)
    @user = user
    @preheader = "Your #{@user.membership_rank} membership is active. Your card and your flights are in Sillage."
    flight_club_mail subject: "Welcome to Flight Club, #{@user.first_name}", template_name: "membership_confirmation"
  end

  private

  helper_method :long_date

  def long_date(time)
    time.strftime("%-d %B %Y")
  end

  def flight_club_mail(subject:, template_name:)
    mail(to: email_address_with_name(@user.email_address, @user.full_name), subject:) do |format|
      format.text { render template_name }
      format.html { render template_name, layout: "flight_club_mailer" }
    end
  end
end
