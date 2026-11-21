require "test_helper"

class FlightIdentityTest < ActiveSupport::TestCase
  setup { @user = users(:julien) }

  test "a flight is named by its description, then its location, never by its code" do
    flight = @user.flights.create!(status: "logged", flown_on: Date.new(2026, 11, 19), location: "Gap", name: "Flare test")
    assert_equal "Flare test", flight.title
    assert_equal "19 Nov 2026 · Flare test", flight.label

    flight.update!(name: nil)
    assert_equal "Gap", flight.title
    assert_no_match(/FLT/, flight.label)
  end

  test "descriptions written by the application do not name a flight" do
    [ "Draft flight", "Prepared flight", "FlySight 2026-11-19 14:32" ].each do |generated|
      assert_equal "Gap", @user.flights.new(name: generated, location: "Gap").title
    end
    assert_equal "Flight", @user.flights.new.title
    assert_equal "Tunnel flight", @user.flights.new(environment: "tunnel").title
  end

  test "a sky flight lasts from exit to opening, or to landing without an opening" do
    exit_at = Time.utc(2026, 11, 19, 14, 32)
    flight = @user.flights.new(exit_at:, opening_at: exit_at + 134, landing_at: exit_at + 400, duration_seconds: 1_800)
    assert_equal 134, flight.flight_duration_seconds

    flight.opening_at = nil
    assert_equal 400, flight.flight_duration_seconds

    assert_nil @user.flights.new(duration_seconds: 1_800).flight_duration_seconds
  end

  test "a tunnel flight lasts from the first to the last pitot sample at flying pressure" do
    flight = @user.flights.create!(status: "preparation", environment: "tunnel", duration_seconds: 600)
    assert_nil flight.flight_duration_seconds

    airspeed = ->(elapsed, readings) { flight.sensor_samples.create!(sensor_type: "AIRSPEED", elapsed_seconds: elapsed, readings:) }
    airspeed.call(0, { differential_pressure_pa: 20 })
    airspeed.call(40, { differential_pressure_pa: 450 })
    airspeed.call(90, { differential_pressure_pa: 60 })
    airspeed.call(160, { airspeed_m_s: 30 })
    airspeed.call(200, { differential_pressure_pa: "" })
    flight.sensor_samples.create!(sensor_type: "BARO", elapsed_seconds: 300, readings: { differential_pressure_pa: 900 })

    assert_in_delta 120, flight.flight_duration_seconds
  end

  test "a single flying sample is not a flight time" do
    flight = @user.flights.create!(status: "preparation", environment: "tunnel")
    flight.sensor_samples.create!(sensor_type: "AIRSPEED", elapsed_seconds: 12, readings: { differential_pressure_pa: 450 })
    assert_nil flight.flight_duration_seconds
  end
end
