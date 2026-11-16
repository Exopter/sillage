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
    @state = state_payload
  end

  def state
    render json: state_payload
  end

  def create
    return render json: { error: "A flight is already in progress." }, status: :conflict if current_remote_flight&.then { |flight| flight.preparation? || flight.live? }

    flight = Current.user.flights.create!(
      name: "Tunnel flight", status: "preparation",
      aircraft: Aircraft.active.find_by(id: params[:aircraft_id]),
      pilot: User.available_as_pilot.find_by(id: params[:pilot_id]) || Current.user,
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
    render partial: "remote/debrief", locals: { flight: @flight }
  end

  # Polled by the ground station: the oldest start request still waiting.
  def pending
    flight = Flight.visible_to(Current.user).where(status: "preparation")
      .where(remote_start_requested_at: START_REQUEST_VALIDITY.ago..).order(:remote_start_requested_at).first
    render json: flight ? { flight_id: flight.id, code: flight.code, pilot: flight.display_pilot, aircraft: flight.display_aircraft } : {}
  end

  private

  def require_operations
    head :forbidden unless can_manage_operations?
  end

  def remote_flights
    Current.user.flights.where.not(remote_start_requested_at: nil)
  end

  def current_remote_flight
    remote_flights.where(remote_start_requested_at: 12.hours.ago..).order(:id).last
  end

  def state_payload(flight = current_remote_flight)
    today = remote_flights.where(remote_start_requested_at: Time.current.beginning_of_day..)
    # The phone times the flight against this clock, never its own, which can be minutes off.
    base = { flights_today: today.where.not(status: "preparation").count, server_time: (Time.current.to_f * 1000).round }
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
