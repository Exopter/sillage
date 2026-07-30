# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
# MapLibre GL JS v6.0.0 is vendored for deterministic offline loading.
pin "maplibre-gl", to: "maplibre-gl.js"
pin "maplibre-gl-shared.js", to: "maplibre-gl-shared.js"
pin_all_from "app/javascript/controllers", under: "controllers"
