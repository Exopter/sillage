module Signal
  # Who may feed an acquisition. A recorder identified by its ECU ID is enough:
  # registration and assignment to an assembly describe the flight when they
  # exist, and never block the capture.
  class RecorderAccess
    Denied = Class.new(StandardError)
    MESSAGE = "Connect a recorder before starting acquisition.".freeze

    Access = Data.define(:device_id, :recorder) do
      def assembly
        recorder&.assembly
      end

      def aircraft
        recorder&.aircraft
      end
    end

    def self.allowed?(_recorder)
      true
    end

    def self.resolve!(device_id)
      id = FdrIdentity::DeviceId.normalize(device_id)
      raise Denied, MESSAGE unless FdrIdentity::DeviceId.valid?(id)

      Access.new(device_id: id, recorder: EmbeddedController.find_by(device_id: id))
    end

    def self.for_session!(session, device_id: nil)
      expected = session.station_metadata["recorder_device_id"]
      raise Denied, MESSAGE if expected.blank?
      if device_id.present? && FdrIdentity::DeviceId.normalize(device_id) != expected
        raise Denied, "The connected recorder does not match this acquisition."
      end
      access = resolve!(expected)
      started_with = session.station_metadata["recorder_assembly_id"]
      # An acquisition started on an assembly stays on it; one started without may gain one.
      if started_with.present? && access.assembly&.id != started_with
        raise Denied, "The recorder assembly changed. Start a new acquisition."
      end
      access
    end
  end
end
