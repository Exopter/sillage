module Forge
  class TestRunsController < BaseController
    before_action :set_test_run, only: %i[show validate]

    def index
      @test_runs = TestRun.includes(:build, :part, :operator, :validated_by).recent
    end

    def show
    end

    def validate
      unless Current.user.admin?
        return redirect_to forge_test_run_path(@test_run), alert: "Admin access is required to validate a test."
      end

      @test_run.validate_by!(Current.user, note: params[:validation_note].to_s)
      redirect_to forge_test_run_path(@test_run), notice: "Test validated."
    rescue ActiveRecord::RecordInvalid
      redirect_to forge_test_run_path(@test_run), alert: "Only passed tests can be validated."
    end

    private

    def set_test_run
      @test_run = TestRun.find(params[:id])
    end
  end
end
