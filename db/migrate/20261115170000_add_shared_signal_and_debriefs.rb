class AddSharedSignalAndDebriefs < ActiveRecord::Migration[8.1]
  def change
    add_column :signal_sessions, :gateway_token_digest, :string
    add_column :signal_sessions, :gateway_seen_at, :datetime
    add_column :signal_sessions, :stop_requested_at, :datetime
    create_table :flight_debriefs do |t|
      t.references :flight, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.references :flight_comment, foreign_key: true, index: { unique: true }
      t.string :uuid, null: false, index: { unique: true }
      t.string :status, null: false, default: "recording"
      t.text :transcript
      t.text :summary
      t.text :error_message
      t.timestamps
    end
  end
end
