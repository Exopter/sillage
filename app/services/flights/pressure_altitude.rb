module Flights
  class PressureAltitude
    STANDARD_PRESSURE_PA = 101_325.0
    EXPONENT = 0.190294957
    SCALE_METERS = 44_330.0

    class << self
      def from_pascals(value)
        pressure = Float(value, exception: false)
        return unless pressure&.finite? && pressure.positive?

        SCALE_METERS * (1.0 - (pressure / STANDARD_PRESSURE_PA)**EXPONENT)
      end
    end
  end
end
