module Signal
  class RecorderAccess
    Denied = Class.new(StandardError)
    MESSAGE = "Assign the connected recorder to an assembly before starting acquisition.".freeze

    def self.allowed?(recorder)
      assembly = recorder&.assembly
      assembly&.controlled_fdr? && !assembly.fdr_system? && assembly.serviceability_state != "retired"
    end

    def self.resolve!(device_id)
      id = FdrIdentity::DeviceId.normalize(device_id)
      recorder = EmbeddedController.find_by(device_id: id) if FdrIdentity::DeviceId.valid?(id)
      unless allowed?(recorder)
        raise Denied, MESSAGE
      end
      recorder
    end

    def self.for_session!(session, device_id: nil)
      expected = session.station_metadata["recorder_device_id"]
      raise Denied, MESSAGE if expected.blank?
      if device_id.present? && FdrIdentity::DeviceId.normalize(device_id) != expected
        raise Denied, "The connected recorder does not match this acquisition."
      end
      recorder = resolve!(expected)
      if recorder.assembly.id != session.station_metadata["recorder_assembly_id"]
        raise Denied, "The recorder assembly changed. Start a new acquisition."
      end
      recorder
    end
  end
end
