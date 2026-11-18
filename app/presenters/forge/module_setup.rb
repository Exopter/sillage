module Forge
  # Where an ExoFDR module stands between a bare board and a named, keyed module in a system.
  # The same six steps are shown as marks in the module list and in full on the module page.
  class ModuleSetup
    Step = Data.define(:key, :title, :state, :detail)

    # Firmware that only prints diagnostics on USB-C: no key and no name can be written.
    TEXT_ONLY_FIRMWARE = %r{\Av1_distributed/1\z}

    NEXT_ACTIONS = {
      seen: "connect the board over USB-C", registered: "connect the board over USB-C",
      key: "install the Sillage key over USB-C", named: "name the module",
      name_on_board: "connect over USB-C to write its name", system: "attach it to a system"
    }.freeze

    attr_reader :assembly, :controller

    def initialize(assembly: nil, controller: nil)
      @assembly = assembly
      @controller = controller
    end

    def steps
      @steps ||= begin
        pending = true
        raw_steps.map do |key, title, done, detail, unavailable|
          state = if done then "done"
          elsif unavailable then "unavailable"
          elsif pending
            pending = false
            "next"
          else "pending"
          end
          Step.new(key:, title:, state:, detail:)
        end
      end
    end

    def next_step = steps.find { |step| step.state == "next" }
    def complete? = steps.none? { |step| %w[next pending].include?(step.state) }
    def limited_by_firmware? = steps.any? { |step| step.state == "unavailable" }
    def done_count = steps.count { |step| step.state == "done" }

    def summary
      return "Limited by firmware: no key and no name on the board without USB-C control" if complete? && limited_by_firmware?
      return "Ready" if complete?

      "Next: #{NEXT_ACTIONS.fetch(next_step.key)}"
    end

    def text_only_firmware?
      controller&.last_seen_firmware.to_s.match?(TEXT_ONLY_FIRMWARE)
    end

    private

    def raw_steps
      limited = text_only_firmware?
      no_control = "Not available with this firmware. Flash a build with USB-C control to continue."
      [
        [ :seen, "Seen by Sillage", controller&.last_identified_at.present?,
          controller&.last_identified_at ? "#{[ controller.device_model, controller.last_seen_firmware ].compact_blank.join(' · ').presence || 'Board'}, last seen on #{controller.last_identified_at.to_date.to_fs(:long)}." : "Connect the board over USB-C." ],
        [ :registered, "Registered", controller.present?,
          controller ? "Registered on #{controller.created_at.to_date.to_fs(:long)}." : "Created when the board first connects." ],
        [ :key, "Sillage key installed", controller&.initialized? == true,
          if controller&.initialized? then "Installed on #{controller.fdr_auth_key_installed_at.to_date.to_fs(:long)}."
          elsif limited then no_control
          else "Sillage creates a key for this board and writes it over USB-C. Needed to synchronize and control it."
          end, limited ],
        [ :named, "Named", assembly.present?,
          assembly ? [ assembly.fdr_component_label, assembly.serial_number ].compact.join(" · ") : "Choose its type. Sillage generates the serial number." ],
        [ :name_on_board, "Name written to the board", name_confirmed?,
          if name_confirmed? then "The board answers as #{assembly.serial_number}."
          elsif limited then "Not available with this firmware. Sillage uses the name; the board does not know it."
          else "Written automatically at the next authenticated USB-C connection."
          end, limited ],
        [ :system, "In a system", system_settled?, system_detail ]
      ]
    end

    def name_confirmed?
      return false unless assembly && controller
      installation = assembly.active_fdr_board_installation
      (installation&.embedded_controller_id == controller.id && installation&.confirmed_name == assembly.serial_number) ||
        controller.signal_presence&.status&.dig("identity", "name") == assembly.serial_number
    end

    def system_settled?
      return false unless assembly

      !assembly.fdr_module? || assembly.parent&.fdr_system? == true
    end

    def system_detail
      return "Available once the module is named." unless assembly
      return "Standalone recorder." unless assembly.fdr_module?

      system = assembly.parent if assembly.parent&.fdr_system?
      system ? "#{system.serial_number} with #{system.children.where.not(id: assembly.id).filter_map(&:fdr_component_label).sort.to_sentence.presence || 'no other module'}." : "Attach it to a distributed system."
    end
  end
end
