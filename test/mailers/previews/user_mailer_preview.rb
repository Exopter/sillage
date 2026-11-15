# Preview at /rails/mailers/user_mailer. Append ?tier=explorer to see another rank.
class UserMailerPreview < ActionMailer::Preview
  def flight_club_invitation
    UserMailer.invitation(member)
  end

  def membership_confirmation
    UserMailer.membership_confirmation(member)
  end

  private

  def member
    tier = User::MEMBERSHIP_TIERS.include?(params[:tier]) ? params[:tier] : "pioneer"
    User.new(
      id: 0, email_address: "ada.lindqvist@example.com", role: "user",
      first_name: "Ada", last_name: "Lindqvist",
      membership_tier: tier, member_number: 7, invitation_sent_at: Time.current
    )
  end
end
