require "test_helper"
require Rails.root.join("db/migrate/20261019120100_migrate_flight_notes_to_comments")

class FlightNotesMigrationTest < ActiveSupport::TestCase
  test "migration preserves exact notes and dates attributes Julien and is idempotent" do
    flight = flights(:one)
    original = "  Observation éà\nSecond line\n" + "x" * 4_100
    timestamp = Time.utc(2026, 10, 18, 11, 20)
    flight.update_columns(notes: original, user_id: users(:operator).id, updated_at: timestamp)
    flights(:two).update_column(:notes, " \n\t")
    migration = MigrateFlightNotesToComments.new
    assert_difference "FlightComment.count" do
      migration.suppress_messages { migration.up }
    end
    comment = flight.comments.sole
    assert_equal users(:julien), comment.user
    assert_equal original, comment.body
    assert_equal original, flight.reload.notes
    assert_equal timestamp, comment.created_at
    assert comment.imported_from_notes?
    assert_no_difference "FlightComment.count" do
      migration.suppress_messages { migration.up }
    end
    assert_raises(ActiveRecord::IrreversibleMigration) { migration.down }
  end

  test "migration refuses to invent an author" do
    users(:julien).update!(email_address: "different@example.com")
    flights(:one).update_column(:notes, "Preserve this")
    assert_no_difference "FlightComment.count" do
      assert_raises(RuntimeError) { MigrateFlightNotesToComments.new.suppress_messages { MigrateFlightNotesToComments.new.up } }
    end
  end
end
