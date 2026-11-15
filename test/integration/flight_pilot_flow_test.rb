require "test_helper"

class FlightPilotFlowTest < ActionDispatch::IntegrationTest
  setup do
    @creator = users(:julien)
    @pilot = users(:member)
    sign_in_as @creator
  end

  test "preparation and log forms require a pilot and default to the signed-in creator" do
    users(:operator).update!(disabled_at: Time.current)
    %w[prepare log].each do |intent|
      get new_flight_path(intent:)
      assert_response :success
      assert_select "select[name='flight[pilot_id]'][required]" do
        assert_select "option[selected][value=?]", @creator.id.to_s
        assert_select "option[value=?]", @pilot.id.to_s, text: "Elias Okafor"
        assert_select "option[value=?]", users(:operator).id.to_s, count: 0
        assert_select "option[value=?]", users(:invited).id.to_s, count: 0
      end
    end
  end

  test "creating and editing a flight assigns a pilot independently of its creator" do
    %w[prepare log].each do |intent|
      assert_difference "Flight.count" do
        post flights_path, params: { intent:, flight: { pilot_id: @pilot.id, flown_on: "2026-11-15", location: "Bouloc" } }
      end
      assert_response :redirect
      flight = @creator.flights.order(:id).last
      assert_equal @pilot, flight.pilot
      assert_equal @creator, flight.user
      get flight_path(flight)
      assert_select "dt", text: "Pilot"
      assert_select "dd", text: "Elias Okafor"
      get edit_flight_path(flight)
      assert_select "select[name='flight[pilot_id]'][required] option[selected][value=?]", @pilot.id.to_s

      patch flight_path(flight), params: { flight: { pilot_id: users(:operator).id } }, as: :json
      assert_response :success
      assert_equal users(:operator), flight.reload.pilot
      assert_equal @creator, flight.user
    end
  end

  test "invalid pilots are rejected without changing the flight" do
    flight = flights(:one)
    [ "", User.maximum(:id) + 1, users(:invited).id ].each do |pilot_id|
      patch flight_path(flight), params: { flight: { pilot_id: } }, as: :json
      assert_response :unprocessable_entity
      assert_equal @creator, flight.reload.pilot
    end
    assert_no_difference "Flight.count" do
      post flights_path, params: { intent: "prepare", flight: { description: "Keep my input", pilot_id: User.maximum(:id) + 1 } }
    end
    assert_response :unprocessable_entity
    assert_select "input[name='flight[description]'][value='Keep my input']"
    assert_select "select[name='flight[pilot_id]'][required]"
  end

  test "recorded flight details and browser preview expose the assigned pilot" do
    flight = flights(:one)
    flight.update!(pilot: @pilot)
    get flight_path(flight)
    assert_response :success
    assert_select "select[name='flight[pilot_id]'][required] option[selected][value=?]", @pilot.id.to_s
    get preview_flights_path, params: { id: flight.id, kind: "flight" }
    assert_response :success
    assert_select "dt", text: "Pilot"
    assert_select "dd", text: "Elias Okafor"
  end

  test "a disabled historical pilot remains selected while other details are edited" do
    flight = flights(:one)
    flight.update!(pilot: @pilot)
    @pilot.update!(disabled_at: Time.current)
    get edit_flight_path(flight)
    assert_response :success
    assert_select "select[name='flight[pilot_id]'] option[selected][value=?]", @pilot.id.to_s
    patch flight_path(flight), params: { flight: { pilot_id: @pilot.id, description: "Keep historical attribution" } }, as: :json
    assert_response :success
    assert_equal @pilot, flight.reload.pilot
  end

  test "being named as pilot does not authorize viewing or editing a private flight" do
    flight = flights(:one)
    flight.update!(pilot: @pilot)
    @pilot.complete_membership_welcome!
    sign_in_as @pilot
    get flight_path(flight)
    assert_response :not_found
    patch flight_path(flight), params: { flight: { pilot_id: @pilot.id } }, as: :json
    assert_response :forbidden
  end
end
