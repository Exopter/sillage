module Signal
  class AssignRecorder
    InvalidAssignment = Class.new(StandardError)

    def initialize(device_id:, actor:, assembly_id: nil, configuration_id: nil, assembly_method: nil, component_type: nil)
      @device_id = FdrIdentity::DeviceId.normalize(device_id)
      @actor, @assembly_id = actor, assembly_id
      @configuration_id, @assembly_method, @component_type = configuration_id, assembly_method, component_type
    end

    def call
      raise InvalidAssignment, "The recorder identity is invalid." unless FdrIdentity::DeviceId.valid?(@device_id)

      EmbeddedController.transaction do
        assembly = if @assembly_id.present?
          Assembly.not_retired.connectable_fdrs.find(@assembly_id)
        else
          raise InvalidAssignment, "Select a physical FDR assembly type." if @component_type == "SYSTEMS"
          Assembly.create!(assembly_type: "ExoFDR", fdr_functional_configuration_id: @configuration_id,
            assembly_method: @assembly_method, fdr_component_type: @component_type.presence)
        end
        assembly.lock!
        recorder = EmbeddedController.find_by(device_id: @device_id)
        recorder&.lock!
        if (occupant = assembly.embedded_controller) && occupant != recorder
          raise InvalidAssignment, "This assembly already has a board. Choose an empty assembly."
        end
        if recorder&.assembly && recorder.assembly != assembly
          raise InvalidAssignment, "This recorder already belongs to another assembly."
        end
        recorder ||= EmbeddedController.create!(device_id: @device_id).tap do |created|
          created.record_activity!("registered", source: "signal", actor: @actor)
        end
        FdrIdentity::BindBoard.new(assembly:, controller: recorder, actor: @actor, source: "signal").call
        recorder
      end
    rescue ActiveRecord::RecordNotUnique
      raise InvalidAssignment, "This assignment changed in another request. Refresh and try again."
    end
  end
end
