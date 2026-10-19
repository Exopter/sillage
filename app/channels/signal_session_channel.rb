class SignalSessionChannel < ApplicationCable::Channel
  def subscribed
    signal_session = SignalSession.accessible_to(current_user).find_by!(uuid: params[:uuid])
    stream_for signal_session, coder: ActiveSupport::JSON do |message|
      if SignalSession.accessible_to(current_user).exists?(signal_session.id)
        transmit message
      else
        stop_all_streams
      end
    end
  rescue ActiveRecord::RecordNotFound
    reject
  end
end
