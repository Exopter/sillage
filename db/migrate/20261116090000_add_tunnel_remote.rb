class AddTunnelRemote < ActiveRecord::Migration[8.1]
  def change
    # Set when a phone asks the ground station to start recording this flight.
    add_column :flights, :remote_start_requested_at, :datetime
    add_column :flight_debriefs, :checklist, :jsonb, default: {}, null: false
  end
end
