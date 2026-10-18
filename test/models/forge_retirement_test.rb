require "test_helper"
require_relative "../../db/migrate/20261018180000_remove_forge_builds_and_test_runs"

class ForgeRetirementTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  test "retirement removes legacy data and purges only exclusive evidence blobs" do
    connection = ActiveRecord::Base.connection
    connection.create_table(:builds)
    connection.create_table(:test_runs) { |table| table.references :build, foreign_key: true }
    connection.add_column :users, :bench_token_digest, :string
    connection.add_column :users, :bench_token_created_at, :datetime
    connection.clear_cache!
    connection.execute("INSERT INTO builds (id) VALUES (1)")
    connection.execute("INSERT INTO test_runs (id, build_id) VALUES (1, 1)")
    IdentifierSequence.reserve_through!("build_code", 8)
    IdentifierSequence.reserve_through!("flight_code/2097", 9)
    fdr = create_embedded_controller
    legacy = fdr.record_activity!("build_created", source: "forge", actor: users(:julien))
    retained = fdr.record_activity!("registered", source: "forge", actor: users(:julien))
    exclusive = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("exclusive"), filename: "exclusive.txt")
    shared = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("shared"), filename: "shared.txt")
    flights(:one).video.attach(shared)
    [ exclusive, shared ].each do |blob|
      ActiveStorage::Attachment.insert_all!([ { name: "artifacts", record_type: "TestRun", record_id: 1, blob_id: blob.id, created_at: Time.current } ])
    end

    assert_enqueued_with(job: ActiveStorage::PurgeJob, args: [ exclusive ]) do
      assert_enqueued_jobs 1, only: ActiveStorage::PurgeJob do
        ActiveRecord::Migration.suppress_messages { RemoveForgeBuildsAndTestRuns.new.up }
      end
    end

    assert_not connection.table_exists?(:builds)
    assert_not connection.table_exists?(:test_runs)
    assert_not connection.column_exists?(:users, :bench_token_digest)
    assert_not connection.column_exists?(:users, :bench_token_created_at)
    assert_not ActiveStorage::Attachment.exists?(record_type: "TestRun")
    assert shared.reload.attachments.exists?
    assert_not DeviceActivity.exists?(legacy.id)
    assert DeviceActivity.exists?(retained.id)
    assert_not IdentifierSequence.exists?(name: "build_code")
    assert_equal 9, IdentifierSequence.find_by!(name: "flight_code/2097").last_value
  ensure
    connection&.clear_cache!
    exclusive&.service&.delete(exclusive.key)
    shared&.service&.delete(shared.key)
  end
end
