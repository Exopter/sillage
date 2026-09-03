require "test_helper"

class Flights::DetectLocationTest < ActiveSupport::TestCase
  setup do
    @flight = Flight.create!(
      user: users(:julien),
      aircraft: aircraft(:pilatus),
      name: "Location test",
      status: "analysed",
      started_at: Time.utc(2026, 9, 3, 8, 0),
      landing_at: Time.utc(2026, 9, 3, 8, 10)
    )
  end

  test "detects location from the GPS point at landing" do
    create_point(recorded_at: @flight.started_at, lat: 44.0, lon: 5.0, elapsed_seconds: 0)
    create_point(recorded_at: @flight.landing_at, lat: 44.59701, lon: -1.11649, elapsed_seconds: 600)
    create_point(recorded_at: @flight.landing_at + 1.second, lat: 45.0, lon: 6.0, elapsed_seconds: 601)
    coordinates = nil
    geocoder = fake_geocoder do |latitude:, longitude:|
      coordinates = [ latitude, longitude ]
      "Arcachon-La Teste aerodrome"
    end

    result = Flights::DetectLocation.new(@flight, geocoder:).call

    assert_equal "Arcachon-La Teste aerodrome", result
    assert_equal [ 44.59701, -1.11649 ], coordinates
    assert_equal "Arcachon-La Teste aerodrome", @flight.reload.location
    assert_equal "openstreetmap", @flight.location_source
  end

  test "does not replace an existing manual location" do
    @flight.update!(location: "Operator-entered site", location_source: "manual")
    create_point(recorded_at: @flight.landing_at, lat: 44.59701, lon: -1.11649, elapsed_seconds: 600)
    geocoder_called = false
    geocoder = fake_geocoder do |**|
      geocoder_called = true
      "Detected site"
    end

    result = Flights::DetectLocation.new(@flight, geocoder:).call

    assert_equal "Operator-entered site", result
    assert_not geocoder_called
    assert_equal "manual", @flight.reload.location_source
  end

  test "preserves a manual location entered while geocoding is in progress" do
    create_point(recorded_at: @flight.landing_at, lat: 44.59701, lon: -1.11649, elapsed_seconds: 600)
    flight = @flight
    geocoder = fake_geocoder do |**|
      flight.update!(location: "Late operator value", location_source: "manual")
      "Detected site"
    end

    assert_nil Flights::DetectLocation.new(@flight, geocoder:).call
    assert_equal "Late operator value", @flight.reload.location
    assert_equal "manual", @flight.location_source
  end

  test "does not geocode an invalid GPS point" do
    create_point(recorded_at: @flight.landing_at, lat: 0, lon: 0, elapsed_seconds: 600)
    geocoder_called = false
    geocoder = fake_geocoder do |**|
      geocoder_called = true
      "Null Island"
    end

    assert_nil Flights::DetectLocation.new(@flight, geocoder:).call
    assert_not geocoder_called
    assert_nil @flight.reload.location
  end

  private

  def create_point(attributes)
    @flight.track_points.create!(attributes)
  end

  def fake_geocoder(&block)
    Object.new.tap do |geocoder|
      geocoder.define_singleton_method(:reverse, &block)
    end
  end
end
