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
  ACCOUNT_CONTROLLERS = %w[sessions passwords invitations two_factor/setups two_factor/challenges].freeze

  included do
    before_action :enforce_role_access
    helper_method :can_manage_operations?
  end

  private

  def can_manage_operations?
    Current.user&.admin? == true
  end

  def enforce_role_access
    return unless Current.user || resume_session
    return if can_manage_operations? || ACCOUNT_CONTROLLERS.include?(controller_path)
    return if (request.get? || request.head?) && READ_ACTIONS.fetch(controller_path, []).include?(action_name)

    message = "Your account has read-only access to Flights and Signal. Administrator access is required for this action."
    if request.format.json? || controller_path.start_with?("api/")
      render json: { error: message }, status: :forbidden
    else
      render plain: message, status: :forbidden
    end
  end
end
