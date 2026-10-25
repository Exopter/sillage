class FeedbackMailer < ApplicationMailer
  def status_changed(feedback, previous_status:, status:)
    @feedback = feedback
    @previous_status = previous_status.humanize
    @status = status.humanize

    mail(to: feedback.user.email_address, subject: "Your Sillage feedback ##{feedback.id}: #{@status}")
  end
end
