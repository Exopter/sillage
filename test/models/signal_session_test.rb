require "test_helper"
require_relative "../../db/migrate/20260905131000_correct_completed_signal_flight_status"

class SignalSessionTest < ActiveSupport::TestCase
  test "migration repairs orphan processing states and preserves queued imports and active sessions" do
    orphan, queued, active, importing, imported = 5.times.map do
      Flight.create!(user: users(:julien), name: "Legacy Signal", status: "processing").tap do |flight|
        SignalSession.create!(user: users(:julien), flight:, status: "completed")
      end
    end
    FlightImport.create!(user: users(:julien), target_flight: queued, status: "pending")
    SignalSession.create!(user: users(:julien), flight: active)
    importing.update!(flight_import: FlightImport.create!(user: users(:julien), status: "processing"))
    imported.update!(flight_import: FlightImport.create!(user: users(:julien), status: "imported"))
    ActiveRecord::Migration.suppress_messages { CorrectCompletedSignalFlightStatus.new.up }
    assert_equal "waiting_for_recording", orphan.reload.status
    assert_equal "waiting_for_recording", imported.reload.status
    [ queued, active, importing ].each { |flight| assert_equal "processing", flight.reload.status }
  end
end
