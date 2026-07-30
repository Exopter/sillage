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

assert.match(controllerSource, /Cesium\.Ion\.defaultAccessToken = this\.cesiumTokenValue/)
assert.match(controllerSource, /Cesium\.Terrain\.fromWorldTerrain/)
assert.match(controllerSource, /Cesium\.ImageryLayer\.fromWorldImagery/)
assert.match(controllerSource, /Cesium\.createOsmBuildingsAsync/)
assert.match(controllerSource, /CESIUM_TILE_PROVIDER = "CESIUM_ION"/)

assert.doesNotMatch(controllerSource, /createGooglePhotorealistic3DTileset/)
assert.doesNotMatch(controllerSource, /tile\.googleapis\.com/)
assert.doesNotMatch(flightViewSource, /tile\.googleapis\.com/)

console.log("Cesium ion tile provider tests passed")
