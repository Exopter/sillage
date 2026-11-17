import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { airflowAngle, attitudeFromReadings, dynamicPressure, flyingRange, liftNeeded, nearestSample, signed } from "../../app/javascript/lib/tunnel_flight.js"

assert.ok(Math.abs(airflowAngle(2.49) - 21.88) < 0.01, "the airflow rises at atan(1 / glide ratio)")
assert.equal(airflowAngle(null), null)
assert.equal(airflowAngle(0), null)

assert.deepEqual(attitudeFromReadings({ pitchDeg: -14, rollDeg: 3, w: 1, x: 0, y: 0, z: 0 }), { pitch: -14, roll: 3 },
  "installed readings keep the attitude of their mount profile")
const half = Math.PI / 12
const native = attitudeFromReadings({ w: Math.cos(half), x: 0, y: Math.sin(half), z: 0 })
assert.ok(Math.abs(native.pitch - 30) < 1e-9 && Math.abs(native.roll) < 1e-9, "a native sample is read from its quaternion")
assert.equal(attitudeFromReadings({ w: 0, x: 0, y: 0, z: 0 }), null, "a degenerate quaternion has no attitude")
assert.equal(attitudeFromReadings({ x: 1 }), null)

assert.equal(dynamicPressure({ differential_pressure_pa: 1014, airspeed_m_s: 5 }), 1014, "the pitot differential is the dynamic pressure")
assert.ok(Math.abs(dynamicPressure({ airspeed_m_s: 40 }) - 980) < 1e-9, "without it the recorded airspeed gives the pressure")
assert.equal(dynamicPressure({}), null)

const needed = liftNeeded(1014, airflowAngle(2.49), 101, 1.31)
assert.ok(Math.abs(needed - 101 * 9.80665 * Math.cos(Math.atan(1 / 2.49)) / (1014 * 1.31)) < 1e-12)
assert.equal(liftNeeded(199, 21.9, 101, 1.31), null, "below flying pressure the lift needed is withheld")
assert.equal(liftNeeded(1014, null, 101, 1.31), null, "an unknown glide ratio gives no lift needed")

const pitot = [0, 10, 20, 30, 40, 50].map((t, index) => ({ t, readings: { differential_pressure_pa: [20, 150, 600, 1000, 240, 30][index] } }))
assert.deepEqual(flyingRange(pitot), [20, 40], "flying runs from the first to the last sample at flying pressure")
assert.equal(flyingRange(pitot.slice(0, 2)), null, "a recording that never reaches flying pressure has no flying phase")

const rows = [{ t: 0 }, { t: 1 }, { t: 2.5 }, { t: 10 }]
assert.equal(nearestSample(rows, 2.1), rows[2])
assert.equal(nearestSample(rows, 6), null, "a stale sample is not replayed")
assert.equal(nearestSample([], 1), null)
assert.equal(signed(-2.04), "−2.0")
assert.equal(signed(8), "+8.0")

// The viewer reads a tunnel record without GPS points.
const controllerSource = await readFile(new URL("../../app/javascript/controllers/flight_viewer_controller.js", import.meta.url), "utf8")
const runtimeSource = controllerSource
  .replace('import { Controller } from "@hotwired/stimulus"', "const Controller = class {}")
  .replace(/from "(flight_geometry|flight_chart_plugins|pressure_altitude|tunnel_flight|viewer_resources)"/g,
    (_, name) => `from "${new URL(`../../app/javascript/lib/${name}.js`, import.meta.url).href}"`)
const { default: Viewer } = await import(`data:text/javascript;base64,${Buffer.from(runtimeSource).toString("base64")}`)

const stats = {}
const published = []
globalThis.window = { dispatchEvent: (event) => published.push(event.detail) }
globalThis.CustomEvent = class { constructor(_name, init) { this.detail = init.detail } }
const sensors = [
  ...pitot.map((row, index) => ({ type: "AIRSPEED", t: row.t, readings: { ...row.readings, airspeed_m_s: [5, 15, 31, 41, 20, 6][index] } })),
  ...[0, 10, 20, 30, 40, 50].map((t, index) => ({ type: "IMU:rotation_vector", t, readings: { pitchDeg: [-4, -8, -14, -12, -16, -5][index], rollDeg: [0, 1, -3, 2, 4, 0][index] } })),
  { type: "IMU:accelerometer", t: 30, readings: { x: 0, y: 0, z: 11.8 } }
]
const viewer = Object.assign(new Viewer(), {
  environmentValue: "tunnel", hasGlideRatioValue: true, glideRatioValue: 2.49, flyingMassValue: 101, wingAreaValue: 1.31,
  sensors, points: [], timelineStart: 0, flightDuration: 50, radioValue: [], boundsValue: {},
  statTargets: new Proxy([], { get: (target, key) => key === "filter" ? (test) => {
    const probe = (name) => ({ dataset: { stat: name }, set textContent(value) { stats[name] = value } })
    return ["duration", "peak-load", "airspeed-average", "airspeed-maximum", "dynamic-pressure-average", "dynamic-pressure-maximum",
      "lift-needed-average", "lift-needed-maximum", "to-airflow-average", "to-airflow-range", "pitch-average", "pitch-range",
      "roll-average", "roll-range", "flying-duration", "flying-airspeed"].map(probe).filter(test)
  } : target[key] })
})
viewer.attitudeRows = viewer.recordedAttitudeRows()
assert.equal(viewer.attitudeRows.length, 6)
assert.deepEqual(viewer.phaseRanges(), { all: [0, 50], flying: [20, 40] }, "a tunnel record has no plane, jump or canopy phase")

viewer.activePhase = "flying"
viewer.updatePhaseStatistics()
assert.equal(stats.duration, "20 s")
assert.equal(stats["airspeed-maximum"], (41 * 3.6).toFixed(0))
assert.equal(stats["pitch-average"], "−14.0")
assert.equal(stats["pitch-range"], "−16.0 to −12.0")
assert.equal(stats["to-airflow-average"], signed(-14 + airflowAngle(2.49)))
assert.equal(stats["roll-range"], "−3.0 to +4.0")
assert.equal(stats["dynamic-pressure-maximum"], "1000")
assert.equal(stats["peak-load"], "1.2 g")
assert.equal(stats["flying-duration"], "00:20")
assert.equal(stats["flying-airspeed"], ((31 + 41 + 20) / 3 * 3.6).toFixed(0))

viewer.hasGlideRatioValue = false
viewer.updatePhaseStatistics()
assert.equal(stats["to-airflow-average"], "–", "without a recorded glide ratio the angle to the airflow is withheld")
assert.equal(stats["lift-needed-average"], "—")
assert.equal(stats["pitch-average"], "−14.0", "the measured attitude remains")

viewer.publishTunnelAttitude(30.2)
assert.deepEqual(published.at(-1), { roll: 2, pitch: -12, pressure: 1000 }, "the playhead replays the recorded attitude and pressure")
viewer.publishTunnelAttitude(-30)
assert.deepEqual(published.at(-1), { roll: null, pitch: null, pressure: null })

const view = await readFile(new URL("../../app/views/flights/_tunnel_analysis.html.erb", import.meta.url), "utf8")
assert.doesNotMatch(view, /Exit|Opening|Canopy|GPS samples|data-flight-viewer-target="scene"/, "sky-only blocks stay out of the tunnel record")
assert.ok(view.indexOf("video_section") < view.indexOf('data-flight-viewer-target="unifiedChart"'), "the tunnel cameras come before the telemetry")

console.log("tunnel flight record: ok")
