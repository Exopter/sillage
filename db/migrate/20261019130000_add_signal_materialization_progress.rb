class AddSignalMaterializationProgress < ActiveRecord::Migration[8.1]
  def change
    add_column :signal_sessions, :materialization_status, :string, null: false, default: "complete"
    add_column :signal_sessions, :materialized_batch_id, :bigint, null: false, default: 0
    add_check_constraint :signal_sessions, "materialization_status IN ('pending', 'complete', 'failed')", name: "signal_materialization_status"
  end
end
