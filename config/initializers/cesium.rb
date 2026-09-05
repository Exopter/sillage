version = JSON.parse(Rails.root.join("package.json").read).fetch("dependencies").fetch("cesium")
Rails.application.config.x.cesium_base_url = "/vendor/cesium/#{version}/"
