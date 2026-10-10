import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import Cartesian3 from "../../node_modules/@cesium/engine/Source/Core/Cartesian3.js"
import Cartographic from "../../node_modules/@cesium/engine/Source/Core/Cartographic.js"
import JulianDate from "../../node_modules/@cesium/engine/Source/Core/JulianDate.js"
import CesiumMath from "../../node_modules/@cesium/engine/Source/Core/Math.js"
import ConstantPositionProperty from "../../node_modules/@cesium/engine/Source/DataSources/ConstantPositionProperty.js"
import ConstantProperty from "../../node_modules/@cesium/engine/Source/DataSources/ConstantProperty.js"
const Cesium = {Cartesian3, Cartographic, JulianDate, Math: CesiumMath, ConstantPositionProperty, ConstantProperty}

const resources = new URL("../../app/javascript/lib/viewer_resources.js", import.meta.url).href
const source = (await readFile(new URL("../../app/javascript/lib/signal_map.js", import.meta.url), "utf8"))
  .replace('"viewer_resources"', JSON.stringify(resources))
const {SignalMap} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const button = {disabled: true, textContent: "Following GPS", setAttribute(name, value) {this[name] = value}}
const map = new SignalMap({followButton: button, label: "FLT-2026-016"})
let renders = 0, destroyed = 0, observed = 0
map.cesium = Cesium
map.viewer = {scene: {globe: {getHeight: () => 450}, requestRender() {renders++}}, isDestroyed: () => false, destroy() {destroyed++}}
map.position = new Cesium.ConstantPositionProperty()
map.marker = {show: false, position: map.position}
map.headingLabel = new Cesium.ConstantProperty()
map.ready = true
map.update({gps: null, altitude: null})
assert.equal(map.marker.show, false)
map.update({gps: [5.9, 45.6], altitude: 430})
assert.equal(map.viewer.trackedEntity, map.marker)
const actual = Cesium.Cartographic.fromCartesian(map.position.getValue(Cesium.JulianDate.now()))
assert.ok(Math.abs(Cesium.Math.toDegrees(actual.longitude) - 5.9) < 0.000001)
assert.ok(Math.abs(actual.height - 453) < 0.01, "no marker buried below loaded terrain")
map.update({gps: [5.9, 45.6], altitude: 430})
assert.equal(map.positions.length, 1, "render ticks do not duplicate an unchanged fix")
for (const heading of [0, 90, 180, 270]) {
  const previousRenders = renders
  map.update({gps: [5.9, 45.6], altitude: 430, heading})
  assert.equal(map.headingLabel.getValue(), `FLT-2026-016\nHDG ${String(heading).padStart(3, "0")}°`)
  assert.ok(renders > previousRenders, "heading changes render even when the GPS position is stationary")
}
assert.equal(map.positions.length, 1, "heading changes do not add GPS track points")
map.update({gps: [5.9, 45.6], altitude: 430, heading: -45})
assert.equal(map.headingLabel.getValue(), "FLT-2026-016\nHDG 315°")
map.update({gps: [5.9, 45.6], altitude: 430, heading: 359.8})
assert.equal(map.headingLabel.getValue(), "FLT-2026-016\nHDG 000°")
map.update({gps: [5.9, 45.6], altitude: 430, heading: null})
assert.equal(map.marker.show, true, "GPS remains visible without a heading")
assert.equal(map.headingLabel.getValue(), "FLT-2026-016\nHDG ---")
map.toggleFollow()
assert.equal(button["aria-pressed"], "false")
assert.equal(map.viewer.trackedEntity, undefined)
map.update({gps: [5.901, 45.6], altitude: 900, heading: 315})
assert.equal(map.viewer.trackedEntity, undefined, "new telemetry preserves free camera navigation")
map.toggleFollow()
assert.equal(map.viewer.trackedEntity, map.marker)
map.update({gps: null, altitude: null})
assert.equal(map.marker.show, false, "a stale fix cannot remain marked live")
assert.equal(map.viewer.trackedEntity, undefined)
assert.equal(map.positions.length, 2, "last known path survives a lost fix")
for (let i = 0; i < 700; i++) map.update({gps: [5.9 + i / 100000, 45.6], altitude: 900})
assert.equal(map.positions.length, 600)
map.observer = {disconnect() {observed++}}
map.destroy()
map.update({gps: [5.9, 45.6], altitude: 1000})
assert.equal(destroyed, 1)
assert.equal(observed, 1)
assert.equal(map.ready, false)
assert.ok(renders > 0)
console.log("Signal 3D GPS position, terrain clearance, follow camera, stale fix and lifecycle tests passed")
