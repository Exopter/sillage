module FdrIdentity
  class Resolve
    Result = Data.define(:device_id, :recorder, :installation, :aircraft)

    def initialize(device_id)
      @device_id = device_id.to_s.strip.upcase
    end

    def call
      recorder = Assembly.find_by(device_id: @device_id)
      installation = recorder&.installations&.active&.includes(:aircraft)&.recent&.first

      Result.new(
        device_id: @device_id,
        recorder: recorder,
        installation: installation,
        aircraft: installation&.aircraft
      )
    end
  end
end
