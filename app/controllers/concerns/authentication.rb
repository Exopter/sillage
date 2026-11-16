module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    before_action :require_two_factor_authentication
    helper_method :authenticated?
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
      skip_before_action :require_two_factor_authentication, **options
    end

    def allow_unverified_two_factor_access(**options)
      skip_before_action :require_two_factor_authentication, **options
    end
  end

  private

  def authenticated?
    resume_session.present?
  end

  def require_authentication
    resume_session || request_authentication
  end

  def resume_session
    return Current.session if Current.session

    session_record = find_session_by_cookie
    return unless session_record
    return terminate_session if session_record.user.disabled?

    Current.session = session_record
  end

  def find_session_by_cookie
    Session.includes(:user).find_by(id: cookies.signed[:session_id]) if cookies.signed[:session_id]
  end

  def request_authentication
    return head :unauthorized if authentication_api_request?

    store_authentication_return_path
    redirect_to new_session_path
  end

  def require_two_factor_authentication
    return unless Current.user&.totp_required?
    return if Current.session&.otp_verified?

    return head :forbidden if authentication_api_request?

    store_two_factor_return_path
    redirect_to(Current.user.totp_configured? ? new_two_factor_challenge_path : new_two_factor_setup_path)
  end

  def store_authentication_return_path
    session[:return_to_after_authenticating] = request.fullpath if authentication_navigation?
  end

  def store_two_factor_return_path
    session[:return_to_after_two_factor] = request.fullpath if authentication_navigation?
  end

  def authentication_api_request?
    controller_path.start_with?("api/") || request.format.json?
  end

  def authentication_navigation?
    (request.get? || request.head?) && request.format.html? && !request.xhr? && !authentication_api_request?
  end

  def authentication_return_path?(path)
    path.is_a?(String) && path.start_with?("/") && !path.start_with?("//") &&
      !path.split("?", 2).first.match?(%r{\A/api(?:/|\z)})
  end

  def after_authentication_url
    path = session.delete(:return_to_after_authenticating)
    authentication_return_path?(path) ? path : root_path
  end

  def after_two_factor_url
    paths = [ session.delete(:return_to_after_two_factor), session.delete(:return_to_after_authenticating) ]
    paths.find { |path| authentication_return_path?(path) } || root_path
  end

  def start_new_session_for(user)
    user.sessions.create!(user_agent: request.user_agent, ip_address: request.remote_ip).tap do |session_record|
      Current.session = session_record
      cookies.signed.permanent[:session_id] = { value: session_record.id, httponly: true, same_site: :lax }
    end
  end

  def terminate_session
    Current.session&.destroy
    Current.session = nil
    cookies.delete(:session_id)
    nil
  end
end
