# Phone remote for chained tunnel flights: start a flight on the ground
# station, end it, debrief, start the next one.
class RemoteController < ApplicationController
  layout "remote"
  before_action :require_operations
  before_action :no_store

  START_REQUEST_VALIDITY = 10.minutes

  def show
    @aircraft = Aircraft.active.ordered
    @pilots = User.available_as_pilot.order(:first_name, :email_address)
    @last_flight = remote_flights.order(:id).last
    @folders = FlightFolder.contributable_to(Current.user).includes(:memberships).ordered
    @destination = destination_of(@last_flight, @folders)
    @state = state_payload
  end

  def state
    render json: state_payload
  end

  def create
    return render json: { error: "A flight is already in progress." }, status: :conflict if current_remote_flight&.then { |flight| flight.preparation? || flight.live? }

    destination = params[:destination].to_s
    folder = FlightFolder.contributable_to(Current.user).find_by(id: destination.delete_prefix("folder:")) if destination.start_with?("folder:")
    pilot = User.available_as_pilot.find_by(id: params[:pilot_id]) || Current.user
    # A flight is filed where its pilot can find it.
    return render json: { error: "#{pilot.full_name || pilot.email_address} cannot access this folder." }, status: :unprocessable_entity if folder && !folder.visible_to?(pilot)

    flight = Current.user.flights.create!(
      status: "preparation",
      # A tunnel flight is team work: it is shared unless the operator asks to keep it private.
      folder:, visibility: destination == "private" ? "private" : "team",
      aircraft: Aircraft.active.find_by(id: params[:aircraft_id]),
      pilot:,
      # The remote follows the ground station; alone, it is the tunnel remote.
      environment: (station = SignalStation.for_remote(Current.user))&.environment || "tunnel",
      tunnel_glide_ratio: station&.tunnel_glide_ratio,
      remote_start_requested_at: Time.current
    )
    render json: state_payload(flight), status: :created
  rescue ActiveRecord::RecordInvalid => error
    render json: { error: error.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
  end

  # Ends the flight from the phone. With a live acquisition the ground station is
  # asked to stop; without one the flight simply closes, so it can still be debriefed.
  def finish
    flight = remote_flights.find(params[:id])
    session = flight.signal_sessions.where(status: %w[live syncing]).order(:id).last
    if session
      session.with_lock { session.update!(stop_requested_at: Time.current) unless session.stop_requested_at }
    elsif flight.preparation?
      flight.update!(status: "waiting_for_recording", started_at: flight.remote_start_requested_at, ended_at: Time.current)
    end
    render json: state_payload(flight)
  end

  # Withdraws a flight the ground station has not picked up yet.
  def cancel
    flight = remote_flights.find(params[:id])
    return render json: { error: "The flight has already started." }, status: :conflict unless flight.preparation?

    flight.update!(remote_start_requested_at: nil)
    render json: state_payload(nil)
  end

  def debrief
    @flight = remote_flights.find(params[:id])
    render partial: "remote/debrief", locals: { flight_id: @flight.id, code: @flight.code }
  end

  # Check-in of a ground computer in standby. It reports what it hears, and is
  # handed the oldest start request still waiting as soon as it can record.
  def station
    key = params[:key].to_s
    return head :unprocessable_entity unless key.match?(SignalStation::KEY_FORMAT)

    cast = ActiveModel::Type::Boolean.new
    station = SignalStation.check_in!(user: Current.user, key:,
      ready: cast.cast(params[:ready]) == true, device_id: params[:device_id], aircraft_label: params[:aircraft],
      environment: params[:environment], tunnel_glide_ratio: params[:tunnel_glide_ratio])
    flight = pending_flight if station.ready
    render json: flight ? { flight_id: flight.id, code: flight.code, pilot: flight.display_pilot, aircraft: flight.display_aircraft } : {}
  end

  private

  def require_operations
    head :forbidden unless can_manage_operations?
  end

  def pending_flight
    Flight.visible_to(Current.user).where(status: "preparation")
      .where(remote_start_requested_at: START_REQUEST_VALIDITY.ago..).order(:remote_start_requested_at).first
  end

  # What the phone can count on before it starts a flight.
  def station_payload
    station = SignalStation.for_remote(Current.user)
    return { state: "offline" } unless station

    { state: station.remote_state, aircraft: station.aircraft_label, environment: station.environment, tunnel_glide_ratio: station.tunnel_glide_ratio&.to_f }
  end

  def remote_flights
    Current.user.flights.where.not(remote_start_requested_at: nil)
  end

  def current_remote_flight
    remote_flights.where(remote_start_requested_at: 12.hours.ago..).order(:id).last
  end

  # Where the next flight goes by default: where the last one went.
  def destination_of(flight, folders)
    return "team" unless flight
    return "folder:#{flight.folder_id}" if flight.folder_id && folders.any? { |folder| folder.id == flight.folder_id }

    flight.visibility == "private" ? "private" : "team"
  end

  def state_payload(flight = current_remote_flight)
    today = remote_flights.where(remote_start_requested_at: Time.current.beginning_of_day..)
    # The phone times the flight against this clock, never its own, which can be minutes off.
    base = { flights_today: today.where.not(status: "preparation").count, server_time: (Time.current.to_f * 1000).round,
      station: station_payload }
    return base.merge(phase: "ready") unless flight

    session = flight.signal_sessions.order(:id).last
    debriefed = flight.flight_debriefs.where.not(status: "recording").exists?
    # The flight runs on the phone as soon as it is started: the ground station
    # joins when it can, and a flight it never joined can still be debriefed.
    phase = if flight.preparation? || flight.live? then "flight"
    elsif debriefed then "ready"
    else "debrief"
    end
    base.merge(
      phase:,
      flight: {
        id: flight.id, code: flight.code, pilot: flight.display_pilot, aircraft: flight.aircraft&.display_name || "No aircraft",
        destination: flight.folder&.name || (flight.visibility == "team" ? "Public" : "Private"),
        aircraft_id: flight.aircraft_id, pilot_id: flight.pilot_id,
        started_at: flight.remote_start_requested_at.iso8601, recording: flight.live?,
        debrief_url: debrief_remote_flight_path(flight), cancel_url: remote_flight_path(flight),
        end_url: end_remote_flight_path(flight)
      },
      session: session && {
        gateway_connected: session.gateway_seen_at.present? && session.gateway_seen_at > 15.seconds.ago,
        stop_requested: session.stop_requested_at.present?,
        close_url: close_disconnected_api_v1_signal_session_path(session.uuid)
      }
    )
  end
end
