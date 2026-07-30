class SignalSessionChannel < ApplicationCable::Channel
  def subscribed
    signal_session = current_user.signal_sessions.find_by!(uuid: params[:uuid])
    stream_for signal_session
  rescue ActiveRecord::RecordNotFound
    reject
  end
end
