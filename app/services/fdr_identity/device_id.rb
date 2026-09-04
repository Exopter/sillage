module FdrIdentity
  class DeviceId
    PATTERN = /\AECU-[0-9A-F]{6}\z/
    LEGACY_PATTERN = /\AEXOFDR-([0-9A-F]{6})\z/

    class << self
      def normalize(value)
        normalized = value.to_s.strip.upcase.presence
        return unless normalized

        normalized.sub(LEGACY_PATTERN, 'ECU-\1')
      end

      def valid?(value)
        normalize(value)&.match?(PATTERN) || false
      end
    end
  end
end
