class DashboardController < ApplicationController
  ROOM_PLACEHOLDERS = {
    "atlas" => {
      title: "Sillage Atlas",
      description: "Maps, terrain, route comparison, airspace context, and waypoint planning.",
      icon: "layers"
    },
    "hangar" => {
      title: "Sillage Hangar",
      description: "Fleet, wing hardware, equipment, maintenance, and spare parts.",
      icon: "wrench"
    },
    "signal" => {
      title: "Sillage Signal",
      description: "Telemetry, live feeds, sensor streams, communications, and ground station.",
      icon: "signal"
    },
    "forge" => {
      title: "Sillage Forge",
      description: "Build tools, automation, release workflows, and engineering operations.",
      icon: "layers"
    },
    "core" => {
      title: "Sillage Core",
      description: "Authentication, authorization, audit trails, storage, and operations.",
      icon: "shield"
    }
  }.freeze

  def index
    @jumps = Jump.recent.includes(:flight_import)
  end

  def hud
  end

  ROOM_PLACEHOLDERS.each_key do |room|
    define_method(room) do
      @room = ROOM_PLACEHOLDERS.fetch(room)
      render :room_placeholder
    end
  end
end
