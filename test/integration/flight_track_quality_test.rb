require "test_helper"
require_relative "../support/exo_fdr_binary"

class FlightTrackQualityTest < ActionDispatch::IntegrationTest
  include ExoFdrBinary

  test "import replay preview and refresh share quality analysis while preserving raw records" do
    # Includes a no-fix startup, a nominal 3D fix with gnssFixOK unset,
    # and a persistent altitude step. All remain present in the raw import.
    records = 2_050.times.map do |index|
      altitude = index < 1_000 ? 2_000_000 - index * 50 : 2_300_000 - index * 50
      payload = [ 100_000 + index * 50, 2026, 10, 16, 10, 0, 0, 7, 80, 0,
        index.zero? ? 0 : 3, index < 2 ? 0 : 1, 0, 12,
        20_000_000, 450_000_000, altitude + 47_000, altitude, 1_000, 2_000,
        0, 0, 1_000, 0, 0, 100, 10_000, 125 ].pack("VvC6Vl<C4l<4V2l<5V2v")
      { type: 1, payload: payload, sequence: index, timestamp_us: 1_000_000 + index * 50_000 }
    end
    records << { type: 2, payload: [ 5, 3, 0, 0, 1, 0, 0 ].pack("CCve4"),
      sequence: 2_050, timestamp_us: 103_500_000 }
    binary = fdr_binary(records)
    imported = fdr_import(binary)
    ExoFdr::ImportService.new(imported).call
    flight = imported.flights.sole
    original = flight.track_points.ordered.map(&:attributes)
    sensor_original = flight.sensor_samples.ordered.map(&:attributes)
    assert_not_empty sensor_original
    original_source = imported.source_files.first.download
    stored_bounds = flight.attributes.slice("exit_at", "opening_at", "landing_at")
    processed = Flights::ProcessedTrack.new(flight).call
    assert_equal 2, processed[:quality][:rejected_count]
    assert_equal 2_050, flight.track_points.count
    assert_equal stored_bounds, processed[:analysis].bounds.stringify_keys

    sign_in_as users(:julien)
    get flight_path(flight)
    assert_response :success
    assert_select "[aria-label='GPS quality']", text: /GPS altitude uncertain/
    viewer = css_select("[data-controller='flight-viewer']").first
    displayed = JSON.parse(viewer["data-flight-viewer-points-value"])
    assert_operator displayed.size, :<, 2_050
    assert_equal 2, displayed.map { |point| point["segment"] }.uniq.size
    assert_in_delta 0.1, displayed.first["t"]
    bounds = JSON.parse(viewer["data-flight-viewer-bounds-value"])
    processed[:analysis].bounds.each do |key, value|
      assert_in_delta value - flight.started_at, bounds.fetch(key.to_s.delete_suffix("_at")), 0.001
    end

    route = Flights::RoutePreview.call(flight)
    assert_equal 2, route.map { |point| point[2] }.uniq.size
    Flights::RefreshAnalysis.call(flight)
    assert_equal original, flight.track_points.ordered.map(&:attributes)
    assert_equal sensor_original, flight.sensor_samples.ordered.map(&:attributes)
    assert_equal original_source, imported.source_files.first.download
    assert_equal binary, original_source
    assert_equal stored_bounds, flight.reload.attributes.slice("exit_at", "opening_at", "landing_at")
  end
end
