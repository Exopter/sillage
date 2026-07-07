module Core
  class BaseController < ApplicationController
    before_action :require_admin

    private

    def require_admin
      return if Current.user&.admin?

      redirect_to root_path, alert: "Admin access is required."
    end
  end
end
