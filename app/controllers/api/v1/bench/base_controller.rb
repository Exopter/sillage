module Api
  module V1
    module Bench
      class BaseController < ActionController::API
        wrap_parameters false

        before_action :authenticate_bench_user!

        attr_reader :current_bench_user

        private

        def authenticate_bench_user!
          scheme, token = request.authorization.to_s.split(" ", 2)
          @current_bench_user = User.find_by_bench_token(token) if scheme == "Bearer"
          return if @current_bench_user

          render json: { error: "Invalid or revoked bench token." }, status: :unauthorized
        end
      end
    end
  end
end
