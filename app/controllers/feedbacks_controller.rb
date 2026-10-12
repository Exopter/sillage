class FeedbacksController < ApplicationController
  def new
    feedback = Current.user.feedbacks.new(category: "idea", page_path: params[:page_path])
    render partial: "composer", locals: { feedback: feedback }
  end

  def create
    attributes = params.require(:feedback).permit(:category, :description, :page_path, :screenshot)
    upload = attributes.delete(:screenshot)
    feedback = Current.user.feedbacks.new(attributes)
    if upload.present? && !upload.is_a?(ActionDispatch::Http::UploadedFile)
      return render json: { errors: [ "Screenshot must be an uploaded image." ] }, status: :unprocessable_entity
    end
    feedback.screenshot.attach(upload) if upload.present?

    if feedback.save
      respond_to do |format|
        format.json { render json: { saved: true }, status: :created }
        format.html { render partial: "receipt", locals: { feedback: feedback } }
      end
    else
      respond_to do |format|
        format.json { render json: { errors: feedback.errors.full_messages }, status: :unprocessable_entity }
        format.html { render partial: "composer", locals: { feedback: feedback }, status: :unprocessable_entity }
      end
    end
  end
end
