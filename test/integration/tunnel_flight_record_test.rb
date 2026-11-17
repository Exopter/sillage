require "test_helper"

class TunnelFlightRecordTest < ActionDispatch::IntegrationTest
  setup do
    @flight = flights(:one)
    sign_in_as users(:julien)
  end

  test "a tunnel record replaces the sky blocks with the airflow, attitude and lift" do
    @flight.update!(environment: "tunnel", tunnel_glide_ratio: 2.49)

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
    assert_select ".flight-tunnel-media .video-sync"
    assert_operator response.body.index("flight-tunnel-media"), :<, response.body.index("Tunnel flight data")
    assert_select "input[name='flight[tunnel_glide_ratio]'][value='2.49']"
    assert_select "input[name='flight[exit_at]']", 0
  end

  test "a tunnel record without a glide ratio withholds the airflow angle" do
    @flight.update!(environment: "tunnel", tunnel_glide_ratio: nil)

    get flight_path(@flight)

    assert_response :success
    assert_select "section[data-flight-viewer-glide-ratio-value]", 0
    assert_select ".signal-airflow-glide", text: /Glide ratio not recorded/
  end

  test "the spoken debrief sits beside the tunnel cameras" do
    @flight.update!(environment: "tunnel", tunnel_glide_ratio: 2.49)
    comment = @flight.comments.create!(user: users(:julien), body: "Debrief")
    @flight.flight_debriefs.create!(user: users(:julien), uuid: SecureRandom.uuid, status: "published", flight_comment: comment,
      checklist: { "glide_ratio" => "2.5", "speed" => "150 km/h" })

    get flight_path(@flight)

    assert_select ".flight-tunnel-media .flight-stat-card dd", text: /2\.5\s+Set on the tunnel\s*2\.49/
    assert_select ".flight-tunnel-media .flight-stat-card dd", text: /150 km\/h/
  end

  test "a sky record keeps its trajectory and phases" do
    get flight_path(@flight)

    assert_response :success
    assert_select "section[data-flight-viewer-environment-value='sky']"
    assert_select "[data-flight-viewer-target='scene']"
    assert_select "button[data-phase='canopy']"
    assert_select ".flight-tunnel-media", 0
    assert_select "input[name='flight[exit_at]']"
  end
end
