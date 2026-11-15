module RoleAccess
  extend ActiveSupport::Concern

  READ_ACTIONS = {
    "landing" => %w[show],
    "flights" => %w[index show preview],
    "flight_imports" => %w[show],
    "flight_comments" => %w[index],
    "signal" => %w[index],
    "signal_radio_histories" => %w[show],
    "attachments" => %w[show]
  }.freeze
  ACCOUNT_CONTROLLERS = %w[sessions passwords invitations profiles two_factor/setups two_factor/challenges flight_club/welcomes flight_club/memberships].freeze

  included do
    before_action :enforce_role_access
    helper_method :can_manage_operations?, :can_access_signal?
  end

  private

  def can_manage_operations?
    Current.user&.admin? == true
  end

  def can_access_signal?
    Current.user&.signal_access? == true
  end

  def enforce_role_access
    return unless Current.user || resume_session
    return if can_manage_operations? || ACCOUNT_CONTROLLERS.include?(controller_path)
    return if (request.get? || request.head?) && READ_ACTIONS.fetch(controller_path, []).include?(action_name) &&
      (!controller_path.start_with?("signal") || can_access_signal?)

    rooms = can_access_signal? ? "Flights and Signal" : "Flights"
    message = "Your account has read-only access to #{rooms}. Administrator access is required for this action."
    if request.format.json? || controller_path.start_with?("api/")
      render json: { error: message }, status: :forbidden
    else
      render plain: message, status: :forbidden
    end
  end
end
