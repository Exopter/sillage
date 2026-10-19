require "test_helper"

class SignalSessionChannelTest < ActionCable::Channel::TestCase
  setup do
    @flight = flights(:one)
    @session = @flight.signal_sessions.create!(user: users(:julien))
    stub_connection current_user: users(:operator)
  end

  test "collaborators can subscribe to a shared flight session" do
    @flight.update!(visibility: "team")
    subscribe uuid: @session.uuid
    assert subscription.confirmed?
    assert_has_stream_for @session
  end

  test "private flight sessions and another operator's unassigned session are rejected" do
    subscribe uuid: @session.uuid
    assert subscription.rejected?
    @session.update!(flight: nil)
    subscribe uuid: @session.uuid
    assert subscription.rejected?
  end

  test "an existing stream stops transmitting when flight access is revoked" do
    @flight.update!(visibility: "team")
    subscribe uuid: @session.uuid
    callback = nil
    subscription.define_singleton_method(:stream_from) do |broadcasting, handler, **|
      callback = handler
      super(broadcasting)
    end
    subscription.subscribed
    callback.call({ "type" => "telemetry" })
    assert_equal [ { "type" => "telemetry" } ], transmissions
    @flight.update!(visibility: "private")
    callback.call({ "type" => "private telemetry" })
    assert_equal 1, transmissions.size
    assert_no_streams
  end
end
