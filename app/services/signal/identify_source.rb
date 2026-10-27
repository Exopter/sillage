module Signal
  class IdentifySource
    def initialize(signal_session:, system_id:, component_id: nil)
      @signal_session = signal_session
      @system_id = normalize_id(system_id)
      @component_id = normalize_id(component_id)
    end

    def call
      return unless @system_id

      @signal_session.observe_mavlink_identity!(system_id: @system_id, component_id: @component_id)
      return unless @signal_session.flight

      # A log entry keeps its explicitly selected equipment, including no aircraft.
      return if @signal_session.flight.flown_on.present? && @signal_session.flight.aircraft_id.nil?

      aircraft = @signal_session.flight.aircraft

      if aircraft
        refresh_configuration if learn_installed_source(aircraft)
      elsif (aircraft = resolve_aircraft)
        @signal_session.flight.update!(aircraft:)
        refresh_configuration
      end

      aircraft
    end

    private

    def normalize_id(value)
      id = Integer(value, exception: false)
      id if id&.between?(1, 255)
    end

    def resolve_aircraft
      aircraft = EmbeddedController
        .where(mavlink_system_id: @system_id)
        .filter_map(&:aircraft)
        .uniq

      aircraft.one? ? aircraft.first : nil
    end

    def learn_installed_source(aircraft)
      assemblies = aircraft.installations.active
        .where(installable_type: "Assembly")
        .includes(:installable)
        .map(&:installable)

      modules = assemblies.flat_map { |assembly| assembly.fdr_system? ? assembly.fdr_modules_at : [ assembly ] }
      devices = modules.filter_map(&:embedded_controller)
      configured_matches = devices.select { |device| device.mavlink_system_id == @system_id }
      candidate = if configured_matches.one?
        configured_matches.first
      elsif configured_matches.empty? && assemblies.one?
        unconfigured_source(assemblies.first)
      end
      return false unless candidate

      attributes = {}
      attributes[:mavlink_system_id] = @system_id if candidate.mavlink_system_id.nil?
      attributes[:mavlink_component_id] = @component_id if candidate.mavlink_component_id.nil? && @component_id
      return false if attributes.empty?

      candidate.update!(attributes)
      candidate.record_activity!(
        "mavlink_identity_observed",
        source: "signal",
        details: attributes.transform_keys(&:to_s)
      )
      true
    end

    def unconfigured_source(assembly)
      source = assembly.fdr_system? ? assembly.children.find_by(fdr_component_type: "MAIN") : assembly
      device = source&.embedded_controller || source&.controller_part&.build_embedded_controller
      device if device&.mavlink_system_id.nil?
    end

    def refresh_configuration
      @signal_session.flight.capture_configuration!(replace: true, at: nil)
    end
  end
end
