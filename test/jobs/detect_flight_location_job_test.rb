require "test_helper"

class DetectFlightLocationJobTest < ActiveJob::TestCase
  test "persists a detected location without changing import state" do
    flight = Flight.create!(
      user: users(:julien),
      aircraft: aircraft(:pilatus),
      name: "Location job test",
      status: "analysed",
      started_at: Time.utc(2026, 9, 3, 8, 0),
      landing_at: Time.utc(2026, 9, 3, 8, 10)
    )
    flight.track_points.create!(
      recorded_at: flight.landing_at,
      elapsed_seconds: 600,
      lat: 44.59701,
      lon: -1.11649
    )
    geocoder = Object.new
    geocoder.define_singleton_method(:reverse) { |**| "Arcachon-La Teste aerodrome" }

    job = DetectFlightLocationJob.new(flight)
    job.define_singleton_method(:geocoder) { geocoder }
    job.perform_now

    assert_equal "Arcachon-La Teste aerodrome", flight.reload.location
    assert_equal "analysed", flight.status
  end
end
