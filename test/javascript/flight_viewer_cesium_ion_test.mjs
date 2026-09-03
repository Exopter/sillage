import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const controllerSource = await readFile(
  new URL("../../app/javascript/controllers/flight_viewer_controller.js", import.meta.url),
  "utf8"
)
const flightViewSource = await readFile(
  new URL("../../app/views/flights/show.html.erb", import.meta.url),
  "utf8"
)
const applicationStyles = await readFile(
  new URL("../../app/assets/stylesheets/application.css", import.meta.url),
  "utf8"
)

assert.match(controllerSource, /Cesium\.Ion\.defaultAccessToken = this\.cesiumTokenValue/)
assert.match(controllerSource, /Cesium\.Terrain\.fromWorldTerrain/)
assert.match(controllerSource, /Cesium\.ImageryLayer\.fromWorldImagery/)
assert.match(controllerSource, /Cesium\.createOsmBuildingsAsync/)
assert.match(controllerSource, /CESIUM_TILE_PROVIDER = "CESIUM_ION"/)
assert.match(controllerSource, /creditContainer: this\.creditsTarget/)
assert.match(controllerSource, /creditViewport: this\.sceneTarget/)
assert.match(controllerSource, /maximumScreenSpaceError: 48/)
assert.match(controllerSource, /skipLevelOfDetail: true/)
assert.match(controllerSource, /foveatedConeSize: 0\.35/)
assert.match(controllerSource, /foveatedTimeDelay: 0\.4/)
assert.match(controllerSource, /progressiveResolutionHeightFraction: 0\.35/)
assert.match(flightViewSource, /data-flight-viewer-target="credits"/)
assert.match(applicationStyles, /\.trajectory-credits\s*\{[\s\S]*?position: static;/)
assert.match(applicationStyles, /\.trajectory-credits > \.cesium-widget-credits\s*\{[\s\S]*?position: static;/)
assert.match(applicationStyles, /\.trajectory-credits \.cesium-credit-textContainer\s*\{[\s\S]*?position: static;/)

assert.doesNotMatch(controllerSource, /createGooglePhotorealistic3DTileset/)
assert.doesNotMatch(controllerSource, /tile\.googleapis\.com/)
assert.doesNotMatch(flightViewSource, /tile\.googleapis\.com/)

for (const redundantDefault of [
  "baseScreenSpaceError",
  "skipScreenSpaceErrorFactor",
  "skipLevels",
  "immediatelyLoadDesiredLevelOfDetail",
  "loadSiblings",
  "cullWithChildrenBounds",
  "dynamicScreenSpaceError",
  "dynamicScreenSpaceErrorDensity",
  "dynamicScreenSpaceErrorFactor",
  "dynamicScreenSpaceErrorHeightFalloff",
  "foveatedScreenSpaceError",
  "preloadFlightDestinations",
  "showCreditsOnScreen",
  "enableCollision"
]) {
  assert.doesNotMatch(controllerSource, new RegExp(`${redundantDefault}:`))
}

console.log("Cesium ion tile provider tests passed")
