require "test_helper"
require_relative "../../db/migrate/20260905130000_seed_flight_and_build_identifiers"

class IdentifierSequenceTest < ActiveSupport::TestCase
  test "validated unsaved flights and builds reserve distinct identifiers" do
    first = Flight.new(user: users(:julien), name: "First", started_at: Time.utc(2099))
    second = Flight.new(user: users(:julien), name: "Second", started_at: Time.utc(2099))
    assert first.valid?
    assert second.valid?
    assert_equal "FLT-2099-001", first.code
    assert_equal "FLT-2099-002", second.code
    first.save!
    second.save!
    assembly = Assembly.create!(name: "Identifier test")
    builds = 2.times.map { Build.new(assembly:, created_by: users(:julien), arduino_core_version: "3.3.10") }
    builds.each { |build| assert build.valid? }
    assert_not_equal builds[0].code, builds[1].code
    builds.each(&:save!)
  end

  test "explicit codes advance only their own sequence and deletions do not reuse identifiers" do
    flight = Flight.create!(user: users(:julien), name: "Manual", code: "FLT-2099-008")
    next_flight = Flight.create!(user: users(:julien), name: "Next", started_at: Time.utc(2099))
    assert_equal "FLT-2099-009", next_flight.code
    next_flight.destroy!
    assert_equal "FLT-2099-010", Flight.create!(user: users(:julien), name: "Replacement", started_at: Time.utc(2099)).code
    assert_equal "FLT-2100-001", Flight.create!(user: users(:julien), name: "Next year", started_at: Time.utc(2100)).code
    assembly = Assembly.create!(name: "Manual build")
    build = Build.create!(assembly:, created_by: users(:julien), arduino_core_version: "3.3.10", code: "FDR-DEV-008")
    assert_equal "FDR-DEV-009", build.clone_as_next!(by: users(:julien)).code
    flight.update!(name: "Renamed")
    assert_equal 10, IdentifierSequence.find_by!(name: "flight_code/2099").last_value
  end

  test "migration seeds historical maxima once without reducing existing reservations" do
    flights(:one).update_columns(code: "FLT-2088-041")
    flights(:two).update_columns(code: "custom-flight")
    assembly = Assembly.create!(name: "Legacy build")
    build = Build.create!(assembly:, created_by: users(:julien), arduino_core_version: "3.3.10", code: "custom-build")
    build.update_columns(code: "FDR-DEV-073")
    IdentifierSequence.reserve_through!("flight_code/2026", 99)
    ActiveRecord::Migration.suppress_messages { SeedFlightAndBuildIdentifiers.new.up }
    assert_equal 42, IdentifierSequence.next_value!("flight_code/2088")
    assert_equal 100, IdentifierSequence.next_value!("flight_code/2026")
    assert_equal "FDR-DEV-074", Build.next_code
  end
end

class ConcurrentIdentifierTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  test "concurrent record creation commits unique flight and build codes" do
    flight_ids = []
    build_ids = []
    assembly = Assembly.create!(name: "Concurrent identifiers")
    user_id = users(:julien).id
    gate = Queue.new
    threads = 4.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          gate.pop
          flight = Flight.create!(user_id:, name: "Concurrent identifiers", started_at: Time.utc(2098))
          build = Build.create!(assembly_id: assembly.id, created_by_id: user_id, arduino_core_version: "3.3.10")
          [ flight.id, build.id, flight.code, build.code ]
        end
      end
    end
    4.times { gate << true }
    results = threads.map(&:value)
    flight_ids = results.map(&:first)
    build_ids = results.map { |result| result[1] }
    assert_equal 4, results.map { |result| result[2] }.uniq.size
    assert_equal 4, results.map { |result| result[3] }.uniq.size
    assert_equal 4, Flight.where(id: flight_ids).count
    assert_equal 4, Build.where(id: build_ids).count
  ensure
    threads&.each(&:join)
    Build.where(assembly_id: assembly&.id).delete_all
    Flight.where(name: "Concurrent identifiers").delete_all
    assembly&.destroy!
    IdentifierSequence.where(name: [ "flight_code/2098", "build_code" ]).delete_all
  end
end
