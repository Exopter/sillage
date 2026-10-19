class MigrateFlightNotesToComments < ActiveRecord::Migration[8.1]
  def up
    return unless select_value("SELECT EXISTS (SELECT 1 FROM flights WHERE notes ~ '[^[:space:]]')")

    author_id = select_value("SELECT id FROM users WHERE email_address = 'julien@exopter.com'")
    raise "The confirmed legacy note author julien@exopter.com is missing" unless author_id

    # Notes have no own timestamp. Preserve the last flight update and mark the
    # historical date as approximate in the UI. Keep the old field for rollback.
    execute <<~SQL
      INSERT INTO flight_comments (flight_id, user_id, body, imported_from_notes, created_at, updated_at)
      SELECT id, #{connection.quote(author_id)}, notes, TRUE, updated_at, updated_at
      FROM flights WHERE notes ~ '[^[:space:]]'
      ON CONFLICT (flight_id) WHERE imported_from_notes DO NOTHING
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Keep migrated comments and their subsequent edits."
  end
end
