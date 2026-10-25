module Core
  class FeedbacksController < BaseController
    def index
      @counts = Feedback.group(:status).count
      @pages = {}
      @feedbacks_by_status = Feedback::STATUSES.index_with do |status|
        last_page = [ (@counts.fetch(status, 0) / 20.0).ceil, 1 ].max
        requested_page = params[:pages].is_a?(ActionController::Parameters) ? params[:pages][status].to_i : 1
        @pages[status] = requested_page.clamp(1, last_page)
        Feedback.where(status:).includes(:user).with_attached_screenshot.order(updated_at: :desc, id: :desc)
          .offset((@pages[status] - 1) * 20).limit(20).to_a
      end
    end

    def update
      feedback = Feedback.find(params[:id])
      if feedback.update(params.require(:feedback).permit(:status))
        redirect_to core_feedbacks_path, notice: "Feedback status updated.", status: :see_other
      else
        redirect_to core_feedbacks_path, alert: feedback.errors.full_messages.to_sentence, status: :see_other
      end
    end
  end
end
