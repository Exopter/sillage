module Forge
  class BenchTokensController < BaseController
    def create
      @bench_token = Current.user.rotate_bench_token!
      render :show
    end

    def destroy
      Current.user.revoke_bench_token!
      redirect_to forge_path, notice: "Bench token revoked."
    end
  end
end
