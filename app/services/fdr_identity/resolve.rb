module FdrIdentity
  class Resolve
    Result = Data.define(:device_id, :recorder, :installation, :aircraft)

    def initialize(device_id)
      @device_id = DeviceId.normalize(device_id)
    end

    def call
      recorder = EmbeddedDevice.find_by(device_id: @device_id)
      installation = recorder&.active_installation

      Result.new(
        device_id: @device_id,
        recorder: recorder,
        installation: installation,
        aircraft: installation&.aircraft
      )
    end
  end
end
