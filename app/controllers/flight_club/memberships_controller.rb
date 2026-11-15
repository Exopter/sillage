module FlightClub
  class MembershipsController < BaseController
    def show
      @member = Current.user
    end
  end
end
