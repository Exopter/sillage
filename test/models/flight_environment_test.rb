require "test_helper"

class FlightEnvironmentTest < ActiveSupport::TestCase
  setup { @user = users(:julien) }

  test "a flight is flown in the sky unless stated" do
    flight = @user.flights.create!(status: "preparation")
    assert flight.sky?
    assert_equal "Sky", flight.environment_label
  end

  test "an unknown mode is rejected" do
    flight = @user.flights.new(status: "preparation", environment: "space")
    assert_not flight.valid?
    assert flight.errors[:environment].any?
  end

  test "a tunnel flight is at Inclined Slovenia unless another place is entered" do
    flight = @user.flights.create!(status: "preparation", environment: "tunnel")
    assert_equal "Inclined Slovenia", flight.location
    assert_equal "manual", flight.location_source
    assert_equal "Elsewhere", @user.flights.create!(status: "preparation", environment: "tunnel", location: "Elsewhere").location
    sky = @user.flights.create!(status: "preparation", location: "Drop zone")
    sky.update!(environment: "tunnel")
    assert_equal "Drop zone", sky.location
    assert_nil @user.flights.create!(status: "preparation").location
  end

  test "a logged tunnel flight needs no location, a sky flight does" do
    assert @user.flights.new(status: "logged", flown_on: Date.new(2026, 11, 16), environment: "tunnel").valid?
    sky = @user.flights.new(status: "logged", flown_on: Date.new(2026, 11, 16), environment: "sky")
    assert_not sky.valid?
    assert sky.errors[:location].any?
  end

  test "the tunnel glide ratio stays within the tunnel range" do
    flight = @user.flights.new(status: "preparation", environment: "tunnel", tunnel_glide_ratio: 3)
    assert flight.valid?
    assert_in_delta 18.43, flight.tunnel_airflow_angle, 0.01
    flight.tunnel_glide_ratio = 4.2
    assert_not flight.valid?
    flight.tunnel_glide_ratio = 1.2
    assert_not flight.valid?
  end

  test "the logbook filters by mode and leaves recordings out of a mode" do
    tunnel = @user.flights.create!(status: "preparation", environment: "tunnel")
    sky = @user.flights.create!(status: "preparation", environment: "sky")
    ids = Flights::Logbook.new(user: @user, filter: "all", environment: "tunnel").flight_ids
    assert_includes ids, tunnel.id
    assert_not_includes ids, sky.id
    entries = Flights::Logbook.new(user: @user, filter: "all", environment: "tunnel").page(1)
    assert entries.all? { |entry| entry.is_a?(Flight) && entry.tunnel? }
  end

  test "a bulk edit changes the mode of the selection only" do
    flights = Array.new(2) { @user.flights.create!(status: "preparation") }
    other = @user.flights.create!(status: "preparation")
    result = Flights::EditSelection.new(user: @user, flight_ids: flights.map(&:id), changes: { environment: "tunnel" }).call
    assert_equal 2, result.updated
    assert flights.all? { |flight| flight.reload.tunnel? }
    assert other.reload.sky?
    assert_raises(Flights::EditSelection::Invalid) { Flights::EditSelection.new(user: @user, flight_ids: flights.map(&:id), changes: { environment: "space" }) }
  end

  test "a ground station reports its mode and glide ratio and ignores values outside the tunnel range" do
    key = SecureRandom.uuid
    station = SignalStation.check_in!(user: @user, key:, remote_enabled: true, ready: true, environment: "tunnel", tunnel_glide_ratio: "2.99")
    assert_equal "tunnel", station.environment
    assert_equal 2.99, station.tunnel_glide_ratio.to_f
    station = SignalStation.check_in!(user: @user, key:, remote_enabled: true, ready: true, environment: "space", tunnel_glide_ratio: "9.5")
    assert_equal "tunnel", station.environment
    assert_equal 2.99, station.tunnel_glide_ratio.to_f
  end
end
