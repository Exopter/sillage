require "test_helper"

class FlightImportOwnershipTest < ActiveSupport::TestCase
  test "existing fixtures are owned by the default user" do
    assert_equal users(:julien), flight_imports(:one).user
    assert_equal users(:julien), flight_imports(:two).user
  end
end
