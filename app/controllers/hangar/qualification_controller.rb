module Hangar
  class QualificationController < BaseController
    def index
      @builds = Build.includes(:assembly, :test_runs).recent
      @test_runs = TestRun.includes(:build, :part, :operator, :validated_by).recent.limit(20)
    end
  end
end
