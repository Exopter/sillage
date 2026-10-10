# Pin npm packages by running ./bin/importmap
draw Rails.root.join("config/landing_importmap.rb")

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin "exs1_contract", to: "lib/exs1_contract.js"
pin "fdr_partial_file", to: "lib/fdr_partial_file.js"
pin "fdr_sync_protocol", to: "lib/fdr_sync_protocol.js"
pin "fdr_wifi_provisioning", to: "lib/fdr_wifi_provisioning.js"
pin "viewer_resources", to: "lib/viewer_resources.js"
pin "flight_geometry", to: "lib/flight_geometry.js"
pin "pressure_altitude", to: "lib/pressure_altitude.js"
pin "signal_layout", to: "lib/signal_layout.js"
pin "signal_telemetry", to: "lib/signal_telemetry.js"
pin "signal_instruments", to: "lib/signal_instruments.js"
pin "signal_map", to: "lib/signal_map.js"
pin "aircraft_connection", to: "lib/aircraft_connection.js"
pin "usb_page_lifecycle", to: "lib/usb_page_lifecycle.js"
pin_all_from "app/javascript/controllers", under: "controllers"

pin "signal_outbox", to: "lib/signal_outbox.js"
pin "flight_chart_plugins", to: "lib/flight_chart_plugins.js"
pin "fdr_heartbeat", to: "lib/fdr_heartbeat.js"
pin "fdr_api", to: "lib/fdr_api.js"
pin "recorder_identity", to: "lib/recorder_identity.js"

pin "imu_health", to: "lib/imu_health.js", preload: false

pin "imu_tutorial", to: "lib/imu_tutorial.js", preload: false
