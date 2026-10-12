module Core
  class FeedbacksController < BaseController
    def index
      @page = [ params[:page].to_i, 1 ].max
      @feedbacks = Feedback.includes(:user).with_attached_screenshot.order(created_at: :desc, id: :desc)
        .offset((@page - 1) * 20).limit(21).to_a
      @has_next_page = @feedbacks.length > 20
      @feedbacks = @feedbacks.first(20)
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
