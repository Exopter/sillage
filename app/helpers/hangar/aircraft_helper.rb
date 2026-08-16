module Hangar::AircraftHelper
  def hangar_asset_code(asset)
    asset.internal_number
  end

  def hangar_asset_name(asset)
    asset.respond_to?(:name) ? asset.name : asset.display_name
  end

  def hangar_asset_kind(asset)
    asset.is_a?(Assembly) ? (asset.parent_id? ? "Subassembly" : "Assembly") : "Part"
  end

  def hangar_asset_status(asset)
    return [ "ready", "Serviceable" ] if asset.is_a?(Assembly)

    case asset.state
    when "quarantined" then [ "caution", "Review flag" ]
    when "retired" then [ "fault", "Retired" ]
    when "available" then [ "unknown", "Available" ]
    else [ "ready", "Installed" ]
    end
  end

  def hangar_aircraft_status(aircraft)
    aircraft.active? ? [ "ready", "Ready" ] : [ "unknown", "Unavailable" ]
  end

  def hangar_aircraft_summary(aircraft)
    installations = aircraft.installations.select(&:active?)
    assembly_count = installations.count { |installation| installation.installable.is_a?(Assembly) }
    direct_part_count = installations.count { |installation| installation.installable.is_a?(Part) }
    nested_part_count = installations.sum do |installation|
      installation.installable.is_a?(Assembly) ? installation.installable.snapshot_part_numbers.size : 0
    end
    fragments = []
    fragments << pluralize(assembly_count, "assembly") if assembly_count.positive?
    fragments << pluralize(direct_part_count + nested_part_count, "part") if (direct_part_count + nested_part_count).positive?
    fragments.presence&.join(" · ") || "No installed equipment"
  end

  def hangar_root_assembly(assembly)
    assembly.parent ? hangar_root_assembly(assembly.parent) : assembly
  end

  def hangar_assembly_aircraft(assembly)
    Installation.active.find_by(installable: hangar_root_assembly(assembly))&.aircraft
  end

  def hangar_build_status(build)
    validated = build.test_runs.any?(&:validated?)
    return [ "ready", "Qualified" ] if validated
    return [ "caution", "Tests in progress" ] if build.test_runs.any?

    [ "unknown", "Draft" ]
  end
end
