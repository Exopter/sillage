require "test_helper"

class Flights::SampleSensorsTest < ActiveSupport::TestCase
  test "samples every type in one query with bounded model allocation and retained endpoints" do
    flight = flights(:one)
    flight.sensor_samples.delete_all
    now = Time.current
    records = { "BARO" => 31, "IMU" => 15, "TIME" => 3 }.flat_map do |type, count|
      count.times.map do |index|
        { flight_id: flight.id, sensor_type: type, elapsed_seconds: index, recorded_at: now + index,
          readings: { "index" => index }, created_at: now, updated_at: now }
      end
    end
    SensorSample.insert_all!(records)
    counts = flight.sensor_samples.group(:sensor_type).count
    queries = []
    subscription = ActiveSupport::Notifications.subscribe("sql.active_record") { |*args| queries << args.last[:sql] }
    samples = Flights::SampleSensors.call(flight, limit_per_type: 5, counts:)
    assert_equal 1, queries.count { |sql| sql.include?('WITH "selected" AS MATERIALIZED') }
    groups = samples.group_by(&:sensor_type)
    assert_equal %w[BARO IMU TIME], groups.keys
    groups.each do |type, rows|
      assert_operator rows.size, :<=, 5
      assert_equal 0, rows.first.readings.fetch("index")
      assert_equal({ "BARO" => 30, "IMU" => 14, "TIME" => 2 }.fetch(type), rows.last.readings.fetch("index"))
      assert_equal rows.sort_by(&:elapsed_seconds), rows
      assert rows.all? { |row| row.flight_id == flight.id }
    end
    assert_equal 3, groups.fetch("TIME").size
  ensure
    ActiveSupport::Notifications.unsubscribe(subscription) if subscription
  end

  test "rejects a display budget that cannot retain endpoints" do
    assert_raises(ArgumentError) { Flights::SampleSensors.call(flights(:one), limit_per_type: 1) }
  end
end
