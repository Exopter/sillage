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

  test "flight chart aligns retained Ground RX to the recording clock and reads new batches after replay caching" do
    @flight.update!(status: "analysed", started_at: @at + 10.minutes, ended_at: @at + 20.minutes)
    post batches_api_v1_signal_session_path(@session.uuid), params: { sequence: 0, samples: [
      radio(601), radio(602, rssi: 255), radio(603, rssi: 0, remoteRssi: 200)
    ] }, as: :json
    assert_response :success
    @flight.sensor_samples.delete_all
    get flight_path(@flight)
    assert_response :success
    rows = JSON.parse(css_select("[data-flight-viewer-radio-value]").first["data-flight-viewer-radio-value"])
    assert_equal [ 1, 2, 3 ], rows.map { |row| row["t"] }
    assert_in_delta(-57, rows.first["ground_dbm"])
    assert_nil rows.second["ground_dbm"]
    assert_equal(-127, rows.third["ground_dbm"])
    assert_equal [ @session.id ], rows.pluck("session_id").uniq
    assert_select "input[data-metric='radio-signal'][checked]", count: 1

    post batches_api_v1_signal_session_path(@session.uuid), params: { sequence: 1, samples: [ radio(604) ] }, as: :json
    assert_response :success
    get flight_path(@flight)
    rows = JSON.parse(css_select("[data-flight-viewer-radio-value]").first["data-flight-viewer-radio-value"])
    assert_equal [ 1, 2, 3, 4 ], rows.pluck("t")

    @session.update!(status: "discarded")
    get flight_path(@flight)
    assert_equal "[]", css_select("[data-flight-viewer-radio-value]").first["data-flight-viewer-radio-value"]
    assert_select "input[data-metric='radio-signal'][checked]", count: 0
  end

  test "flight radio projection combines only its retained sessions using absolute timestamps" do
    other = users(:julien).signal_sessions.create!(flight: @flight, started_at: @at + 20)
    [ [ @session, 1 ], [ other, 22 ] ].each do |session, seconds|
      Signal::IngestBatch.new(signal_session: session, sequence: 0, payload: { samples: [ radio(seconds) ] }).call
    end
    unrelated = users(:julien).signal_sessions.create!(started_at: @at)
    Signal::IngestBatch.new(signal_session: unrelated, sequence: 0, payload: { samples: [ radio(9) ] }).call
    rows = Signal::RadioHistory.ground_signal_for(@flight)
    assert_equal [ 1, 22 ], rows.pluck(:t)
    assert_equal [ @session.id, other.id ], rows.pluck(:session_id)
    @flight.started_at = nil
    assert_empty Signal::RadioHistory.ground_signal_for(@flight)
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

  test "flight embeds full session history directly after statistics and excludes discarded sessions" do
    @flight.update!(status: "analysed", started_at: @at + 10, ended_at: @at + 20)
    Signal::IngestBatch.new(signal_session: @session, sequence: 0, payload: { samples: [ radio(1), radio(15), radio(30) ] }).call
    @session.complete!(ended_at: @at + 40)
    discarded = users(:julien).signal_sessions.create!(flight: @flight, started_at: @at, status: "discarded")
    get flight_path(@flight)
    assert_response :success
    assert_select ".flight-statistics + section[aria-label='Signal radio history']", count: 1
    assert_select "[data-controller='signal-radio-history']", count: 1
    assert_select "[aria-label='Signal radio history'] h2", "Radio signal"
    assert_select "[aria-label='Radio chart measurements'] button[aria-pressed='true']", count: 4
    rows = JSON.parse(css_select("[data-signal-radio-history-rows-value]").first["data-signal-radio-history-rows-value"])
    assert_equal [ 1, 15, 30 ], rows.pluck("elapsed_seconds")
    assert_select "a[href='#{signal_session_radio_history_path(@session.uuid, format: :csv)}']", count: 1
    assert_select "a[href='#{signal_session_radio_history_path(discarded.uuid, format: :csv)}']", count: 0
  end

  test "IMU summary preserves timestamped evidence without treating warnings or missing preflight as success" do
    @flight.update!(status: "analysed", ended_at: @at + 60)
    5.times do |index|
      @session.operator_events.create!(flight: @flight, event_type: "warning", occurred_at: @at + index,
        label: "IMU: Quality telemetry lost", metadata: { source: "imu_health", issues: [ "quality_unavailable" ], boot_id: 42, imu_epoch: 2 })
    end
    @session.operator_events.create!(flight: @flight, event_type: "note", occurred_at: @at + 6, label: "Operator note", metadata: {})
    get flight_path(@flight)
    assert_response :success
    assert_select "section[aria-label='Signal radio history'] + section[aria-label='IMU quality']", count: 1
    assert_select "section[aria-label='IMU quality']" do
      assert_select "h2", "IMU quality"
      assert_select "details > summary", text: "Show 2 earlier changes", count: 1
      assert_select ".exds-history__event", count: 5
      assert_select ".exds-history__event-title", text: "Quality telemetry lost", count: 5
      assert_select ".exds-history__badge--caution", text: "Attention", count: 5
      assert_select "time[datetime='2026-10-16T09:00:04Z']", count: 1
      assert_select ".exds-history__text-value", "Not recorded"
    end
    assert_no_match(/Operator note/, response.body)
  end

  test "IMU panel keeps invalidated preflight evidence and is absent without evidence" do
    @flight.update!(status: "analysed", ended_at: @at + 60)
    get flight_path(@flight)
    assert_select "section[aria-label='IMU quality']", count: 0
    @flight.imu_checks.create!(user: users(:julien), embedded_controller: create_embedded_controller(device_id: "ECU-ABC987"),
      uuid: SecureRandom.uuid, firmware: "fdr_integrated/58", configuration_digest: "test-digest", kind: "preflight",
      outcome: "passed", boot_id: 42, imu_epoch: 2, invalidated_at: @at + 1,
      summary: { reason: "Stationary check passed", roll_mean: 0.5, pitch_mean: 0.2, warnings: [ "Gyroscope manufacturer status 0/3" ] })
    get flight_path(@flight)
    assert_select "section[aria-label='IMU quality']" do
      assert_select ".exds-history__text-value", "Recheck required"
      assert_select ".exds-history__event-title", "Preflight"
      assert_select ".exds-history__event-body p", text: "Gyroscope manufacturer status 0/3"
      assert_select ".exds-history__badge--caution", text: "Recheck required"
    end
  end

  private

  def radio(seconds, **readings)
    { kind: "sensor", sensor_type: "RADIO", recorded_at: (@at + seconds).iso8601,
      readings: { rssi: 133, remoteRssi: 114, noise: 38, remoteNoise: 38, rxErrors: 7, fixed: 12, txBufferPercent: 90, airTelemetryAgeMs: 120 }.merge(readings) }
  end
end
