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
  # Regular users prepare and log flights, and do everything on a flight they can see: its details,
  # comments, debrief, videos, deletion and the import of its recording. Each controller scopes the
  # flight to the ones visible to the user. Standalone recordings, Signal, hardware and selections of
  # several flights stay with administrators.
  FLIGHT_ACTIONS = {
    "flights" => %w[new create edit update destroy],
    "flight_imports" => %w[new create],
    "flight_comments" => %w[create edit update destroy],
    "flight_debriefs" => %w[create show update destroy upload process_audio publish realtime checklist live],
    "flight_video_uploads" => %w[create sign complete],
    "tunnel_videos" => %w[destroy]
  }.freeze
  ACCOUNT_CONTROLLERS = %w[sessions passwords invitations profiles two_factor/setups two_factor/challenges flight_club/welcomes flight_club/memberships].freeze

  included do
    before_action :enforce_role_access
    helper_method :can_manage_operations?, :can_access_signal?, :can_manage_flight?
  end

  private

  def can_manage_operations?
    Current.user&.admin? == true
  end

  def can_access_signal?
    Current.user&.signal_access? == true
  end

  # Seeing a flight is enough to work on it.
  def can_manage_flight?(flight)
    flight.visible_to?(Current.user)
  end

  def enforce_role_access
    return unless Current.user || resume_session
    return if can_manage_operations? || ACCOUNT_CONTROLLERS.include?(controller_path)
    return if FLIGHT_ACTIONS.fetch(controller_path, []).include?(action_name)
    return if (request.get? || request.head?) && READ_ACTIONS.fetch(controller_path, []).include?(action_name) &&
      (!controller_path.start_with?("signal") || can_access_signal?)

    deny_role_access
  end

  def deny_role_access
    rooms = can_access_signal? ? "Flights and Signal" : "Flights"
    message = "Your account works on the flights it can see and has read-only access to the rest of #{rooms}. Administrator access is required for this action."
    if request.format.json? || controller_path.start_with?("api/")
      render json: { error: message }, status: :forbidden
    else
      render plain: message, status: :forbidden
    end
  end
end
