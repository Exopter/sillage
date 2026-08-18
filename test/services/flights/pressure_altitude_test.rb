require "test_helper"

class Flights::PressureAltitudeTest < ActiveSupport::TestCase
  test "matches the shared pressure-altitude vectors" do
    cases = JSON.parse(file_fixture("pressure_altitude_cases.json").read)

    cases.each do |example|
      altitude = Flights::PressureAltitude.from_pascals(example.fetch("pressure_pa"))

      assert_in_delta example.fetch("altitude_m"), altitude, 0.001
    end
  end

  test "rejects missing, non-numeric, non-finite and non-positive pressure" do
    [ nil, "", "invalid", Float::NAN, Float::INFINITY, 0, -1 ].each do |value|
      assert_nil Flights::PressureAltitude.from_pascals(value)
    end
  end
end
