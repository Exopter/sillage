require "test_helper"

class IdentifierSequenceTest < ActiveSupport::TestCase
  test "validated unsaved flights reserve distinct identifiers" do
    first = Flight.new(user: users(:julien), name: "First", started_at: Time.utc(2099))
    second = Flight.new(user: users(:julien), name: "Second", started_at: Time.utc(2099))
    assert first.valid?
    assert second.valid?
    assert_equal "FLT-2099-001", first.code
    assert_equal "FLT-2099-002", second.code
    first.save!
    second.save!
  end

  test "explicit codes advance only their own sequence and deletions do not reuse identifiers" do
    flight = Flight.create!(user: users(:julien), name: "Manual", code: "FLT-2099-008")
    next_flight = Flight.create!(user: users(:julien), name: "Next", started_at: Time.utc(2099))
    assert_equal "FLT-2099-009", next_flight.code
    next_flight.destroy!
    assert_equal "FLT-2099-010", Flight.create!(user: users(:julien), name: "Replacement", started_at: Time.utc(2099)).code
    assert_equal "FLT-2100-001", Flight.create!(user: users(:julien), name: "Next year", started_at: Time.utc(2100)).code
    flight.update!(name: "Renamed")
    assert_equal 10, IdentifierSequence.find_by!(name: "flight_code/2099").last_value
  end
end

class ConcurrentIdentifierTest < ActiveSupport::TestCase
  self.use_transactional_tests = false

  test "concurrent record creation commits unique flight codes" do
    flight_ids = []
    user_id = users(:julien).id
    gate = Queue.new
    threads = 4.times.map do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          gate.pop
          flight = Flight.create!(user_id:, name: "Concurrent identifiers", started_at: Time.utc(2098))
          [ flight.id, flight.code ]
        end
      end
    end
    4.times { gate << true }
    results = threads.map(&:value)
    flight_ids = results.map(&:first)
    assert_equal 4, results.map { |result| result[1] }.uniq.size
    assert_equal 4, Flight.where(id: flight_ids).count
  ensure
    threads&.each(&:join)
    Flight.where(name: "Concurrent identifiers").delete_all
    IdentifierSequence.where(name: "flight_code/2098").delete_all
  end
end
