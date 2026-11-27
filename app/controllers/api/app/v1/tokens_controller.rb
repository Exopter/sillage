module Api
  module App
    module V1
      class TokensController < BaseController
        # Sign-out: revokes the token that made the request.
        def destroy
          current_app_token.destroy!
          head :no_content
        end
      end
    end
  end
end
