module FlightClub
  class BaseController < ApplicationController
    before_action :require_membership

    private

    def require_membership
      redirect_to root_path unless Current.user.member?
    end
  end
end
