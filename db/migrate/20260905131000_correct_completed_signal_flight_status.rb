class CorrectCompletedSignalFlightStatus < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      UPDATE flights SET status = 'waiting_for_recording', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processing'
        AND EXISTS (SELECT 1 FROM signal_sessions WHERE flight_id = flights.id AND status = 'completed')
        AND NOT EXISTS (SELECT 1 FROM signal_sessions WHERE flight_id = flights.id AND status IN ('live', 'syncing'))
        AND NOT EXISTS (
          SELECT 1 FROM flight_imports
          WHERE (target_flight_id = flights.id OR id = flights.flight_import_id) AND status IN ('pending', 'processing')
        )
    SQL
  end

  def down
    execute "UPDATE flights SET status = 'processing' WHERE status = 'waiting_for_recording'"
  end
end
