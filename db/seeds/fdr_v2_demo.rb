# Run with: .\script\dev.ps1 rails runner db/seeds/fdr_v2_demo.rb
# These synthetic records are restricted to the local Docker development database.
unless Rails.env.development? && ActiveRecord::Base.connection_db_config.database == "sillage_docker_development"
  raise "FDR demo seeds are only allowed in the local Docker development database"
end

require "active_support/testing/time_helpers"
extend ActiveSupport::Testing::TimeHelpers

load Rails.root.join("db/seeds.rb")

ApplicationRecord.transaction do
  demo_user = User.find_or_create_by!(email_address: "fdr-demo@example.test") do |user|
    user.role = "user"
    user.password = "ExoFDR-Demo-2026!"
    user.invitation_accepted_at = Time.current
  end
  configuration = FdrFunctionalConfiguration.find_or_create_by!(version: 2) do |item|
    item.planned_capabilities = "PCB modules with independent power, local recording and distributed sensing. Demo inventory only; no hardware qualification implied."
  end
  started_at = 7.days.ago.beginning_of_day
  moved_at = 2.days.ago.beginning_of_day
  units = {}
  definitions = {
    alpha: [ "SYSTEMS", "Alpha system: complete module set" ],
    beta: [ "SYSTEMS", "Beta system: Main assigned, other modules pending" ],
    original_main: [ "MAIN", "Original Alpha Main, transferred to Beta" ],
    main: [ "MAIN", "Current Alpha Main" ],
    central: [ "CENTRAL", "Alpha Central" ],
    airspeed: [ "AIRSPEED", "Alpha AirSpeed" ],
    display: [ "DISPLAY", "Alpha Display" ],
    spare: [ "MAIN", "Standalone spare Main for bench work" ],
    lite: [ "LITE", "Standalone Lite" ]
  }
  definitions.each do |key, (type, description)|
    notes = "Local demo: #{description}. Synthetic inventory, not real hardware."
    units[key] = Assembly.find_or_create_by!(notes:) do |item|
      item.assembly_type = "ExoFDR"
      item.fdr_functional_configuration = configuration
      item.fdr_component_type = type
    end
  end

  # Replay membership changes once, using the ordinary application callbacks.
  if units[:original_main].module_memberships.empty?
    travel_to(started_at) do
      %i[original_main central airspeed display].each { |key| units.fetch(key).update!(parent: units[:alpha]) }
    end
    travel_to(moved_at) do
      units[:original_main].update!(parent: units[:beta])
      units[:main].update!(parent: units[:alpha])
    end
  end

  %i[original_main main central airspeed display spare lite].each_with_index do |key, index|
    device_id = format("ECU-020000D0%04X", index + 1)
    board = EmbeddedController.find_or_create_by!(device_id:) do |item|
      item.device_model = "Synthetic #{units.fetch(key).fdr_component_label} board"
    end
    unless board.fdr_board_installations.exists?
      FdrIdentity::BindBoard.new(assembly: units.fetch(key), controller: board, actor: demo_user, at: started_at).call
    end
  end

  components = {
    main: [ [ "STORAGE", "Recording storage" ], [ "RADIO", "Telemetry radio" ], [ "POWER_SUPPLY", "Main power pack" ] ],
    central: [ [ "GPS", "GNSS receiver" ], [ "IMU", "Inertial sensor" ], [ "POWER_SUPPLY", "Central power pack" ] ],
    airspeed: [ [ "AIRSPEED", "Differential pressure sensor" ] ],
    display: [ [ "POWER_SUPPLY", "Display LiPo pack" ] ],
    lite: [ [ "GPS", "Lite GNSS receiver" ], [ "IMU", "Lite inertial sensor" ], [ "STORAGE", "Lite recording storage" ] ]
  }
  components.each do |key, parts|
    parts.each do |function_code, model|
      part = Part.find_or_create_by!(manufacturer: "Sillage demo", serial_number: "DEMO-#{key.to_s.upcase}-#{function_code}") do |item|
        item.function = Function.find_by!(code: function_code)
        item.model = model
      end
      part.install_in!(units.fetch(key), at: started_at) if part.part_installations.empty?
    end
  end

  aircraft = Aircraft.find_or_create_by!(registration: "DEMO-ALPHA") do |item|
    item.name = "Alpha demonstration aircraft"
    item.notes = "Synthetic local demo. No real aircraft or hardware connection."
  end
  if units[:alpha].installations.empty?
    Installation.create!(installable: units[:alpha], aircraft:, installed_at: started_at)
  end

  [ [ "FDR demo: original composition", units[:original_main], started_at + 1.day ],
    [ "FDR demo: current composition", units[:main], moved_at + 1.day ] ].each do |name, recorder, recorded_at|
    next if demo_user.flights.exists?(name:)
    flight = demo_user.flights.create!(name:, fdr: recorder, aircraft:, status: "logged", visibility: "team",
      flown_on: recorded_at.to_date, started_at: recorded_at, location: "Local demonstration",
      notes: "Synthetic logbook entry showing the FDR system composition at recording time. No flight was performed.")
    flight.capture_configuration!(replace: true, at: recorded_at)
  end

  puts({ account: demo_user.email_address, system_url: "/hangar/assemblies/#{units[:alpha].id}",
    assemblies: units.transform_values(&:serial_number), parts: Part.where(manufacturer: "Sillage demo").count,
    flights: demo_user.flights.count }.to_json)
end
