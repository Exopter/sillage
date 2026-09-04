module Hangar::AircraftHelper
  def hangar_asset_code(asset)
    asset.is_a?(Assembly) ? asset.identity_label : (asset.serial_number.presence || asset.internal_number)
  end

  def hangar_asset_name(asset)
    asset.display_name
  end

  def hangar_asset_kind(asset)
    return "Part" unless asset.is_a?(Assembly)
    return "ExoFDR" if asset.controlled_fdr?

    asset.parent_id? ? "Subassembly" : "Assembly"
  end

  def hangar_asset_status(asset)
    if asset.is_a?(Assembly)
      return {
        "in_preparation" => [ "pending", "In preparation" ],
        "serviceable" => [ "ready", "Serviceable" ],
        "quarantined" => [ "caution", "Quarantined" ],
        "retired" => [ "fault", "Retired" ]
      }.fetch(asset.serviceability_state)
    end

    case asset.state
    when "quarantined" then [ "caution", "Review flag" ]
    when "retired" then [ "fault", "Retired" ]
    when "available" then [ "ready", "Available" ]
    else [ "ready", "Installed" ]
    end
  end

  def hangar_aircraft_status(aircraft)
    aircraft.active? ? [ "ready", "Ready" ] : [ "fault", "Unavailable" ]
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
end
