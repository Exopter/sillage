module FlightClub
  class WelcomesController < BaseController
    layout "flight_club"
    skip_before_action :present_membership_welcome

    def show
      @member = Current.user
    end

    def update
      first_welcome = Current.user.awaiting_membership_welcome?
      Current.user.complete_membership_welcome!
      UserMailer.membership_confirmation(Current.user).deliver_later if first_welcome
      redirect_to root_path
    end
  end
end
