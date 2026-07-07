class ApplicationMailer < ActionMailer::Base
  default from: -> { default_from_address }
  after_action :apply_postmark_message_stream
  layout "mailer"

  private

  def default_from_address
    address = ENV.fetch("MAIL_FROM", "noreply@exopter.com")
    name = ENV["MAIL_FROM_NAME"].presence

    name ? "#{name} <#{address}>" : address
  end

  def apply_postmark_message_stream
    return if ENV["POSTMARK_MESSAGE_STREAM"].blank?
    return unless mail.respond_to?(:message_stream=)

    mail.message_stream = ENV["POSTMARK_MESSAGE_STREAM"]
  end
end
