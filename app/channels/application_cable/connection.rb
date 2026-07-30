module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect
      session_record = Session.find_by(id: cookies.signed[:session_id])
      self.current_user = session_record&.user
      reject_unauthorized_connection unless current_user&.active_for_authentication?
    end
  end
end
