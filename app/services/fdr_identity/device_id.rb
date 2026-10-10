module FdrIdentity
  class DeviceId
    # Keep legacy recordings readable; new firmware uses the complete MAC.
    PATTERN = /\AECU-(?:[0-9A-F]{6}|[0-9A-F]{12})\z/

    class << self
      def normalize(value)
        value.to_s.strip.upcase.presence
      end

      def valid?(value)
        normalize(value)&.match?(PATTERN) || false
      end

      def label(value)
        value.to_s.match?(/\AECU-[0-9A-F]{12}\z/) ? "ECU-#{value[-6, 6]}" : value
      end
    end
  end
end
