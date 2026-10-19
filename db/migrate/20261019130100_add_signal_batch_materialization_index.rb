class AddSignalBatchMaterializationIndex < ActiveRecord::Migration[8.1]
  def change
    add_index :signal_batches, [ :signal_session_id, :id ], name: "index_signal_batches_for_materialization"
  end
end
