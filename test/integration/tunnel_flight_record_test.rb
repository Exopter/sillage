require "test_helper"

class TunnelFlightRecordTest < ActionDispatch::IntegrationTest
  setup do
    @flight = flights(:one)
    sign_in_as users(:julien)
  end

  def record_samples(*types)
    types.each do |type|
      @flight.sensor_samples.create!(sensor_type: type, recorded_at: @flight.started_at || Time.current, elapsed_seconds: 1,
        readings: { "airspeed_m_s" => 38, "pitchDeg" => -12, "rollDeg" => 3 })
    end
  end

  test "a tunnel record replaces the sky blocks with the airflow, attitude and lift" do
    @flight.update!(environment: "tunnel", tunnel_glide_ratio: 2.49)
    record_samples "AIRSPEED", "IMU:rotation_vector"

    get flight_path(@flight)

    assert_response :success
    assert_select "section[data-flight-viewer-environment-value='tunnel'][data-flight-viewer-glide-ratio-value='2.49'][data-flight-viewer-bounds-value='{}']"
    assert_select ".flight-overview-strip span", text: "Glide ratio set"
    assert_select ".flight-overview-strip strong", text: "2.49"
    assert_select ".flight-overview-strip strong", text: /21\.9/
    assert_select ".flight-overview-strip span", text: /Exit|Jump|Opening|Canopy/, count: 0
    assert_select "button[data-flight-viewer-target='phaseButton']", 2
    assert_select "button[data-phase='flying']", text: "Flying"
    assert_select "[data-flight-viewer-target='scene']", 0
    assert_select ".flight-airflow [data-controller='signal-airflow'][data-signal-airflow-recorded-value='true'][data-signal-airflow-ratio-value='2.49']"
    assert_select "input[data-metric='to-airflow'][checked]"
    assert_select "input[data-metric='altitude']", 0
    assert_select ".flight-source-grid dt", text: "GPS samples", count: 0
    assert_select "link[href*='Cesium']", 0
    assert_select ".flight-review-media .video-sync"
    assert_select "[data-flight-viewer-target=instrumentPanel] + .flight-review-media + .flight-statistics"
    assert_select "input[name='flight[tunnel_glide_ratio]'][value='2.49']"
    assert_select "input[name='flight[exit_at]']", 0
  end

  test "a tunnel record without a glide ratio withholds the airflow angle" do
    @flight.update!(environment: "tunnel", tunnel_glide_ratio: nil)
    record_samples "AIRSPEED", "IMU:rotation_vector"

    get flight_path(@flight)

    assert_response :success
    assert_select "section[data-flight-viewer-glide-ratio-value]", 0
    assert_select ".signal-airflow-glide", text: /Glide ratio not recorded/
  end

  test "a tunnel record without telemetry states it instead of drawing empty charts" do
    @flight.update!(environment: "tunnel", tunnel_glide_ratio: 2.49)

    get flight_path(@flight)

    assert_response :success
    assert_select ".flight-empty-state strong", text: "No telemetry recorded"
    assert_select ".flight-empty-state a[href='#{new_flight_import_path(flight_id: @flight.id)}']", text: /Import recording/
    assert_select ".flight-empty-state strong", text: I18n.t("flights.video.tunnel_empty_title")
    assert_select "[data-flight-viewer-target='unifiedChart']", 0
    assert_select "[data-controller='signal-airflow']", 0
    assert_select ".flight-statistics", 0
  end

  test "a tunnel record without orientation samples keeps its chart and states the missing attitude" do
    @flight.update!(environment: "tunnel", tunnel_glide_ratio: 2.49)
    record_samples "AIRSPEED"

    get flight_path(@flight)

    assert_response :success
    assert_select "[data-flight-viewer-target='unifiedChart']"
    assert_select ".flight-airflow .flight-empty-state strong", text: "No attitude recorded"
    assert_select "[data-controller='signal-airflow']", 0
    assert_select ".flight-airflow [data-flight-viewer-target='scrubber']"
  end

  test "the spoken debrief sits beside the tunnel cameras" do
    @flight.update!(environment: "tunnel", tunnel_glide_ratio: 2.49)
    comment = @flight.comments.create!(user: users(:julien), body: "Debrief")
    @flight.flight_debriefs.create!(user: users(:julien), uuid: SecureRandom.uuid, status: "published", flight_comment: comment,
      checklist: { "glide_ratio" => "2.5", "speed" => "150 km/h" })

    get flight_path(@flight)

    assert_select "#analysis .flight-debrief-entry" do
      assert_select ".flight-debrief-checklist dt", count: DebriefChecklist::ITEMS.size
      assert_select "dd", text: "2.5"
      assert_select "dd", text: "150 km/h"
      assert_select ".flight-debrief-summary li", text: "Debrief"
    end
    assert_select ".flight-overview-strip strong", text: "2.49"
    assert_select ".flight-overview-strip [data-stat='flying-airspeed']"

    patch flight_comment_path(@flight, comment), params: { flight_comment: { body: "Updated observations" } }
    follow_redirect! headers: { "Turbo-Frame" => "comments_flight_#{@flight.id}" }
    assert_select "turbo-stream[target='analysis_debrief_flight_#{@flight.id}'] .flight-debrief-summary li", text: "Updated observations"
  end

  test "a sky record keeps its trajectory and phases" do
    get flight_path(@flight)

    assert_response :success
    assert_select "section[data-flight-viewer-environment-value='sky']"
    assert_select "[data-flight-viewer-target='scene']"
    assert_select "button[data-phase='canopy']"
    assert_select ".flight-review-media .video-sync"
    assert_select "input[name='flight[exit_at]']"
  end
end
