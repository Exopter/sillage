# Flight Club members meet their card once, before their first page of Sillage.
module MembershipWelcome
  extend ActiveSupport::Concern

  included do
    before_action :present_membership_welcome
  end

  private

  def present_membership_welcome
    return unless request.get? && request.format.html? && !request.xhr?
    return unless Current.user&.awaiting_membership_welcome?
    return if Current.user.totp_required? && !Current.session&.otp_verified?

    redirect_to flight_club_welcome_path
  end
end
