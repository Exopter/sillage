class DeviceActivity < ApplicationRecord
  TITLES = {
    "registered" => "FDR registered",
    "authentication_prepared" => "Authentication prepared",
    "initialized" => "FDR initialized",
    "assembly_linked" => "Physical asset assignment changed",
    "wifi_profile_added" => "Wi-Fi network added",
    "wifi_profile_updated" => "Wi-Fi network updated",
    "wifi_profile_removed" => "Wi-Fi network removed",
    "wifi_profiles_reordered" => "Wi-Fi priority changed",
    "wifi_credential_updated" => "Wi-Fi credential updated",
    "connectivity_provisioned" => "Connectivity applied to FDR",
    "mavlink_identity_observed" => "MAVLink identity observed",
    "installed_in_aircraft" => "Physical asset installed",
    "removed_from_aircraft" => "Physical asset removed",
    "build_created" => "Build created",
    "build_cloned" => "Build cloned",
    "test_run_synchronized" => "Test run synchronized",
    "test_run_validated" => "Test run validated"
  }.freeze

  belongs_to :embedded_device
  belongs_to :actor, class_name: "User", optional: true

  validates :event_type, :source, :occurred_at, presence: true

  before_update :prevent_changes
  before_destroy :prevent_changes

  scope :recent, -> { order(occurred_at: :desc, id: :desc) }

  def title
    TITLES.fetch(event_type, event_type.to_s.humanize)
  end

  def description
    case event_type
    when "registered"
      details["device_id"].presence || "The recorder was added to Forge."
    when "assembly_linked"
      asset = details["asset_id"].presence
      previous = details["previous_asset_id"].presence
      return "Linked to physical asset #{asset}." if asset && !previous
      return "Moved from physical asset #{previous} to #{asset}." if asset && previous
      return "Unlinked from physical asset #{previous}." if previous

      "Physical asset assignment cleared."
    when "wifi_profile_added", "wifi_profile_removed", "wifi_credential_updated"
      details["ssid"].presence || "Wi-Fi configuration changed."
    when "wifi_profile_updated"
      state = ActiveModel::Type::Boolean.new.cast(details["enabled"]) ? "enabled" : "disabled"
      "#{details["ssid"]} was #{state}."
    when "wifi_profiles_reordered"
      "#{details["ssid"]} moved to priority #{details["position"].to_i + 1}."
    when "connectivity_provisioned"
      "#{details["profile_count"]} Wi-Fi profiles applied to #{details["device_id"]}."
    when "mavlink_identity_observed"
      [ details["mavlink_system_id"] && "System #{details["mavlink_system_id"]}",
        details["mavlink_component_id"] && "component #{details["mavlink_component_id"]}" ].compact.join(" · ")
    when "installed_in_aircraft"
      "Installed in #{details["aircraft_registration"]}."
    when "removed_from_aircraft"
      "Removed from #{details["aircraft_registration"]}."
    when "build_created"
      details["build_code"].to_s
    when "build_cloned"
      "#{details["build_code"]} cloned from #{details["previous_build_code"]}."
    when "test_run_synchronized"
      "#{details["recipe_id"]} on #{details["build_code"]} · #{details["outcome"].to_s.titleize}"
    when "test_run_validated"
      "#{details["recipe_id"]} on #{details["build_code"]}."
    else
      "Recorded by #{source.titleize}."
    end
  end

  private

  def prevent_changes
    errors.add(:base, "Device activity is immutable")
    throw(:abort)
  end
end
