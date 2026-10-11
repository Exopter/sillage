class CreateRecorderConnections < ActiveRecord::Migration[8.1]
  def change
    create_table :recorder_connections do |t|
      t.references :embedded_controller, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :observer_id, null: false
      t.string :transport, null: false
      t.datetime :last_seen_at, null: false
    end
    add_index :recorder_connections, [ :user_id, :observer_id, :transport, :embedded_controller_id ], unique: true, name: 'index_recorder_connections_on_observer'
    add_index :recorder_connections, :last_seen_at
  end
end
