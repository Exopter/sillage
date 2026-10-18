require "test_helper"

class SignalRadioHistoryTest < ActionDispatch::IntegrationTest
  setup do
    @at = Time.utc(2026, 10, 16, 9)
    @flight = users(:julien).flights.create!(name: "Radio campaign", status: "live", started_at: @at)
    @session = users(:julien).signal_sessions.create!(flight: @flight, started_at: @at)
    sign_in_as(users(:julien))
  end

  test "records every report idempotently and exposes full history independently of flight samples" do
    payload = { sequence: 0, samples: [ radio(1), radio(20, rssi: 255, remoteNoise: 255, txBufferPercent: 255) ] }
    2.times do
      post batches_api_v1_signal_session_path(@session.uuid), params: payload, as: :json
      assert_response :success
    end
    @session.complete!(ended_at: @at + 100)
    @flight.sensor_samples.delete_all
    get signal_session_radio_history_path(@session.uuid)
    assert_response :success
    assert_select "h1", "Radio history"
    assert_select "[data-signal-radio-history-duration-value='100.0']"
    rows = JSON.parse(css_select("[data-signal-radio-history-rows-value]").first["data-signal-radio-history-rows-value"])
    assert_equal 2, rows.size
    assert_in_delta(-57, rows.first["ground_dbm"])
    assert_in_delta 50, rows.first["ground_margin_db"]
    assert_nil rows.last["ground_dbm"]
    assert_nil rows.last["air_margin_db"]
    assert_nil rows.last["tx_free_percent"]
    assert_equal 20, rows.last["elapsed_seconds"]
    get signal_session_radio_history_path(@session.uuid, format: :csv)
    assert_response :success
    csv = CSV.parse(response.body, headers: true)
    assert_equal 2, csv.size
    assert_equal "255", csv[1]["rssi"]
    assert_equal "7", csv.first["rx_errors"]
    assert_equal "120", csv.first["air_telemetry_age_ms"]
    get signal_path(view: "home")
    assert_select "a[href='#{signal_session_radio_history_path(@session.uuid)}']", text: "Radio history"
  end

  test "private and discarded sessions cannot be read or exported by other users" do
    sign_in_as(users(:operator))
    [ :html, :csv ].each do |format|
      get signal_session_radio_history_path(@session.uuid, format:)
      assert_response :not_found
    end
    @flight.update!(visibility: "team")
    get signal_session_radio_history_path(@session.uuid)
    assert_response :success
    @session.update!(status: "discarded")
    get signal_session_radio_history_path(@session.uuid)
    assert_response :not_found
  end

  test "unassigned sessions keep radio reports before saving and empty history is explicit" do
    @session.update!(flight: nil)
    get signal_session_radio_history_path(@session.uuid)
    assert_select ".workspace-empty", /No radio reports/
    post batches_api_v1_signal_session_path(@session.uuid), params: { sequence: 0, samples: [ radio(1) ] }, as: :json
    assert_response :success
    get signal_session_radio_history_path(@session.uuid, format: :csv)
    assert_response :success
    assert_equal 1, CSV.parse(response.body, headers: true).size
  end

  private

  def radio(seconds, **readings)
    { kind: "sensor", sensor_type: "RADIO", recorded_at: (@at + seconds).iso8601,
      readings: { rssi: 133, remoteRssi: 114, noise: 38, remoteNoise: 38, rxErrors: 7, fixed: 12, txBufferPercent: 90, airTelemetryAgeMs: 120 }.merge(readings) }
  end
end
