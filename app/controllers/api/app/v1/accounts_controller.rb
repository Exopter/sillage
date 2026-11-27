module Api
  module App
    module V1
      class AccountsController < BaseController
        def show
          render json: account_payload(current_user)
        end
      end
    end
  end
end
