module FdrIdentity
  class Resolve
    Result = Data.define(:device_id, :recorder, :installation, :aircraft)

    def initialize(device_id, at: nil)
      @device_id = DeviceId.normalize(device_id)
      @at = at
    end

    def call
      recorder = EmbeddedController.find_by(device_id: @device_id)
      installation = @at ? recorder&.installation_at(@at) : recorder&.active_installation

      Result.new(
        device_id: @device_id,
        recorder: recorder,
        installation: installation,
        aircraft: installation&.aircraft
      )
    end
  end
end
