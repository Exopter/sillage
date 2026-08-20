class MoveMavlinkIdentityToAssemblies < ActiveRecord::Migration[8.1]
  def up
    add_column :assemblies, :mavlink_system_id, :integer
    add_column :assemblies, :mavlink_component_id, :integer
    add_column :signal_sessions, :mavlink_system_id, :integer
    add_column :signal_sessions, :mavlink_component_id, :integer

    migrate_aircraft_identity_to_assemblies
    migrate_signal_session_identity

    remove_index :aircraft, name: "index_aircraft_on_telemetry_system_id"
    remove_column :aircraft, :telemetry_system_id
  end

  def down
    add_column :aircraft, :telemetry_system_id, :string

    migrate_assembly_identity_to_aircraft

    add_index :aircraft, :telemetry_system_id, unique: true,
      where: "telemetry_system_id IS NOT NULL AND telemetry_system_id != ''"
    remove_column :signal_sessions, :mavlink_component_id
    remove_column :signal_sessions, :mavlink_system_id
    remove_column :assemblies, :mavlink_component_id
    remove_column :assemblies, :mavlink_system_id
  end

  private

  def migrate_aircraft_identity_to_assemblies
    installation_class = migration_model("installations")
    aircraft_class = migration_model("aircraft")
    assembly_class = migration_model("assemblies")

    installation_class
      .where(installable_type: "Assembly", removed_at: nil)
      .pluck(:aircraft_id, :installable_id)
      .group_by(&:first)
      .each do |aircraft_id, installations|
        next unless installations.one?

        telemetry_system_id = aircraft_class.where(id: aircraft_id).pick(:telemetry_system_id)
        numeric_id = strict_mavlink_system_id(telemetry_system_id)
        next unless numeric_id

        assembly_class.where(id: installations.first.last).update_all(mavlink_system_id: numeric_id)
      end
  end

  def migrate_signal_session_identity
    signal_session_class = migration_model("signal_sessions")

    signal_session_class.find_each do |signal_session|
      metadata = signal_session.station_metadata
      metadata = JSON.parse(metadata) if metadata.is_a?(String)
      next unless metadata.is_a?(Hash)

      numeric_id = strict_mavlink_system_id(metadata["telemetry_system_id"])
      signal_session.update_columns(mavlink_system_id: numeric_id) if numeric_id
    rescue JSON::ParserError
      next
    end
  end

  def migrate_assembly_identity_to_aircraft
    installation_class = migration_model("installations")
    assembly_class = migration_model("assemblies")
    aircraft_class = migration_model("aircraft")

    candidates = installation_class
      .where(installable_type: "Assembly", removed_at: nil)
      .pluck(:aircraft_id, :installable_id)
      .group_by(&:first)
      .filter_map do |aircraft_id, installations|
        system_ids = assembly_class.where(id: installations.map(&:last)).where.not(mavlink_system_id: nil).pluck(:mavlink_system_id)
        [ aircraft_id, system_ids.first ] if system_ids.one?
      end

    duplicate_counts = candidates.map(&:last).tally
    candidates.each do |aircraft_id, system_id|
      next unless duplicate_counts.fetch(system_id) == 1

      aircraft_class.where(id: aircraft_id).update_all(telemetry_system_id: system_id.to_s)
    end
  end

  def strict_mavlink_system_id(value)
    string = value.to_s
    return unless string.match?(/\A[0-9]+\z/)

    integer = string.to_i
    integer if integer.between?(1, 255)
  end

  def migration_model(table_name)
    Class.new(ActiveRecord::Base) do
      self.table_name = table_name
      self.inheritance_column = :_type_disabled
    end
  end
end
