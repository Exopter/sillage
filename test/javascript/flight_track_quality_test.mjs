import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"

const Cesium = createRequire(import.meta.url)("cesium")
const source = (await readFile(new URL("../../app/javascript/controllers/flight_viewer_controller.js", import.meta.url), "utf8"))
  .replace('import { Controller } from "@hotwired/stimulus"', "const Controller = class {}")
  .replace(/from "(flight_geometry|flight_chart_plugins|pressure_altitude|viewer_resources)"/g,
    (_, name) => `from "${new URL(`../../app/javascript/lib/${name}.js`, import.meta.url).href}"`)
const { default: Viewer } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const points = [
  { t: 0, lat: 45, lon: 2, alt: 1200, segment: 0, hspeed: 5, distance: 0 },
  { t: 1, lat: 45, lon: 2.0001, alt: 1180, segment: 0, hspeed: 5, distance: 5 },
  { t: 2, lat: 45, lon: 2.0002, alt: 1500, segment: 1, hspeed: 5, distance: 5 },
  { t: 3, lat: 45, lon: 2.0003, alt: 1480, segment: 1, hspeed: 5, distance: 10 }
]
const viewer = Object.assign(new Viewer(), {
  points, sensors: [], timelineStart: 0, flightDuration: 3, currentElapsed: 1.5,
  boundsValue: {}, labelsValue: {}, charts: [],
  cesiumViewer: { entities: new Cesium.EntityCollection(), scene: { requestRender() {} }, isDestroyed: () => false }
})
viewer.addCesiumTrajectory(Cesium, viewer.cesiumViewer)
const paths = viewer.cesiumViewer.entities.values.filter((entity) => entity.polyline)
assert.equal(paths.length, 2, "3D creates separate paths on each side of a discontinuity")
for (const path of paths) assert.equal(path.polyline.positions.getValue(Cesium.JulianDate.now()).length, 2)
assert.equal(viewer.cesiumMarker.show, false, "the marker is hidden inside an unknown interval")
assert.equal(viewer.samplePointAtElapsed(1.5), null)
assert.equal(viewer.integratedDistance(points), 10, "distance does not bridge a gap")
const chart = viewer.metricDataset("altitude", "Altitude", points, (p) => p.alt, "blue", "altitude", "m", true)
assert.equal(chart.segment.borderColor({ p0DataIndex: 0, p1DataIndex: 1 }), "blue")
assert.equal(chart.segment.borderColor({ p0DataIndex: 1, p1DataIndex: 2 }), "transparent", "the chart cannot draw a false climb")
assert.equal(viewer.nearestDataIndexAtElapsed(chart.data, 1.5), null, "the tooltip cannot invent a measurement in a gap")
assert.equal(viewer.nearestDataIndexAtElapsed(chart.data, 2), 2)
assert.equal(chart.tension, 0, "spline control points cannot distort geometry next to a discontinuity")

const thumbnailSource = (await readFile(new URL("../../app/javascript/controllers/route_thumbnail_controller.js", import.meta.url), "utf8"))
  .replace('import { Controller } from "@hotwired/stimulus"', "const Controller = class {}")
const { default: Thumbnail } = await import(`data:text/javascript;base64,${Buffer.from(thumbnailSource).toString("base64")}`)
const commands = []
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "blue" })
const thumbnail = Object.assign(new Thumbnail(), {
  pointsValue: points.map((p) => [p.lat, p.lon, p.segment]),
  element: { width: 124, height: 96, getContext: () => ({ beginPath() {}, stroke() {}, moveTo() { commands.push("move") }, lineTo() { commands.push("line") } }) }
})
thumbnail.connect()
assert.deepEqual(commands, ["move", "line", "move", "line"], "thumbnails keep the same route breaks")
console.log("GPS quality geometry, chart gaps, playback and thumbnail tests passed")
