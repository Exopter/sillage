require "test_helper"

class FunctionTest < ActiveSupport::TestCase
  test "generates a stable technical code from the name" do
    function = Function.create!(name: "Flight computer", description: "Coordinates onboard acquisition")

    assert_equal "FLIGHT_COMPUTER", function.code

    function.update!(name: "Onboard computer")
    assert_equal "FLIGHT_COMPUTER", function.reload.code
  end

  test "keeps an explicitly provided technical code" do
    function = Function.create!(code: "PWR", name: "Power supply")

    assert_equal "PWR", function.code
  end
end
