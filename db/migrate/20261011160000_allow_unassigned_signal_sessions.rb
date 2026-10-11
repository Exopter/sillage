class AllowUnassignedSignalSessions < ActiveRecord::Migration[8.1]
  def change
    change_column_null :signal_sessions, :flight_id, true
    change_column_null :operator_events, :flight_id, true
  end
end
