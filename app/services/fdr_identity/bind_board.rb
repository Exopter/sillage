module FdrIdentity
  class BindBoard
    def initialize(assembly:, controller:, actor: nil, replace: false, at: Time.current)
      @assembly, @controller, @actor, @replace, @at = assembly, controller, actor, replace, at
    end

    def call
      Assembly.transaction do
        @assembly.lock!
        @controller.lock!
        current = @assembly.fdr_board_installations.active.first
        return current if current&.embedded_controller_id == @controller.id
        if current && !@replace
          @assembly.errors.add(:base, "This FDR already has a board. Use Replace board to retain its history.")
          raise ActiveRecord::RecordInvalid, @assembly
        end
        if @controller.fdr_board_installations.active.exists?
          @controller.errors.add(:base, "This board already belongs to another FDR.")
          raise ActiveRecord::RecordInvalid, @controller
        end
        current&.update!(removed_at: @at)
        outgoing_part = current&.embedded_controller&.part
        if outgoing_part&.assembly == @assembly
          outgoing_part.remove_from_assembly!(at: @at)
        end
        installation = @assembly.fdr_board_installations.create!(embedded_controller: @controller, installed_at: @at)
        @controller.association(:active_fdr_board_installation).reset
        @assembly.association(:active_fdr_board_installation).reset
        @controller.record_activity!(current ? "board_replaced" : "fdr_bound", source: "forge", actor: @actor,
          details: { serial_number: @assembly.serial_number, previous_controller_id: current&.embedded_controller_id }, occurred_at: @at)
        installation
      end
    end
  end
end
