module ApplicationHelper
  OS_ICON_PATHS = {
    "gauge" => '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    "activity" => '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    "plane" => '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    "route" => '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    "map" => '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M9 4v13"/><path d="M15 7v13"/>',
    "radio" => '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>',
    "battery" => '<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2"/><path d="M10 11v2"/>',
    "thermometer" => '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    "check" => '<path d="M20 6 9 17l-5-5"/>',
    "circle-check" => '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    "triangle-alert" => '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    "octagon-x" => '<path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    "play" => '<polygon points="6 3 20 12 6 21 6 3"/>',
    "pause" => '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    "rotate-ccw" => '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    "download" => '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    "upload" => '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    "clipboard-check" => '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    "shield" => '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    "wrench" => '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    "crosshair" => '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
    "chevron-down" => '<path d="m6 9 6 6 6-6"/>',
    "chevron-right" => '<path d="m9 18 6-6-6-6"/>',
    "layers" => '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    "list" => '<path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"/>',
    "search" => '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "settings" => '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    "plus" => '<path d="M5 12h14"/><path d="M12 5v14"/>',
    "x" => '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "clock" => '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "file-text" => '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    "log-out" => '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    "signal" => '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>',
    "wind" => '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
    "arrow-up-right" => '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    "menu" => '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>'
  }.freeze

  def sillage_icon(name, size: 18, class_name: "sillage-icon", stroke_width: 2)
    path = OS_ICON_PATHS[name.to_s]
    return "".html_safe unless path

    content_tag(
      :svg,
      raw(path),
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": stroke_width,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: class_name,
      aria: { hidden: true },
      focusable: "false"
    )
  end

  def sillage_current_room
    return action_name if controller_name == "dashboard" && %w[atlas hangar signal forge core].include?(action_name)
    return "core" if controller_path.start_with?("core/") || controller_path.start_with?("devreference/")

    "flight"
  end

  def sillage_shell_title
    content_for(:title).presence || t("app.name")
  end

  def sillage_shell_room_label
    case sillage_current_room
    when "flight"
      "Flights"
    else
      sillage_current_room.titleize
    end
  end

  def sillage_current_room_item
    sillage_room_items.find { |item| item[:id] == sillage_current_room }
  end

  def sillage_current_tab_label
    if sillage_current_room == "flight"
      sillage_flight_tabs.find { |tab| tab[:id] == sillage_current_flight_tab }&.fetch(:label) || sillage_shell_title
    elsif controller_path.start_with?("core/")
      "Users"
    elsif controller_path == "devreference/design_system"
      "Design system"
    else
      "Overview"
    end
  end

  def sillage_breadcrumb_items
    [
      { label: t("app.name"), href: root_path },
      { label: sillage_shell_room_label, href: sillage_current_room_item&.fetch(:href) },
      { label: sillage_current_tab_label, current: true }
    ]
  end

  def sillage_room_items
    [
      { id: "flight", label: "Flights", icon: "plane", href: root_path, enabled: true },
      { id: "atlas", label: "Atlas", icon: "map", href: atlas_path, enabled: true },
      { id: "hangar", label: "Hangar", icon: "wrench", href: hangar_path, enabled: true },
      { id: "signal", label: "Signal", icon: "signal", href: signal_path, enabled: true },
      { id: "forge", label: "Forge", icon: "layers", href: forge_path, enabled: true },
      { id: "core", label: "Core", icon: "shield", href: core_path, enabled: true }
    ]
  end

  def sillage_current_flight_tab
    return "hud" if controller_name == "dashboard" && action_name == "hud"
    return "prep" if controller_name == "flight_imports"
    return "replay" if controller_name == "jumps" && action_name == "show"

    "logbook"
  end

  def sillage_flight_tabs
    [
      { id: "logbook", label: "Logbook", href: jumps_path, enabled: true },
      { id: "prep", label: "Flight prep", href: new_flight_import_path, enabled: true },
      { id: "replay", label: "Replay", href: (request.path if sillage_current_flight_tab == "replay"), enabled: sillage_current_flight_tab == "replay" },
      { id: "hud", label: "HUD", href: flight_hud_path, enabled: true }
    ]
  end

  def sillage_show_flight_tabs?
    sillage_current_room == "flight" && sillage_current_flight_tab != "replay"
  end

  def sillage_content_shell_class
    classes = [ "app-shell" ]
    classes << "is-full-bleed" if sillage_current_flight_tab == "replay"
    classes.join(" ")
  end

  def sillage_user_initials(user)
    return "--" unless user

    parts = user.email_address.to_s.split("@").first.to_s.split(/[._-]/).reject(&:blank?)
    initials = parts.first(2).map { |part| part[0] }.join
    initials.presence&.upcase || user.email_address.to_s.first(2).upcase
  end
end
