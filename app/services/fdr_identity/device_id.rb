module FdrIdentity
  class DeviceId
    PATTERN = /\AEXOFDR-[0-9A-F]{6}\z/

    class << self
      def normalize(value)
        value.to_s.strip.upcase.presence
      end

      def valid?(value)
        normalize(value)&.match?(PATTERN) || false
      end
    end
  end
end
