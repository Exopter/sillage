import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
const source = (await readFile(new URL("../../app/javascript/controllers/signal_workspace_controller.js", import.meta.url), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
const healthURL = new URL("../../app/javascript/lib/imu_health.js", import.meta.url).href
const telemetryURL = new URL("../../app/javascript/lib/signal_telemetry.js", import.meta.url).href
const instrumentsURL = new URL("../../app/javascript/lib/signal_instruments.js", import.meta.url).href
const layoutURL = new URL("../../app/javascript/lib/signal_layout.js", import.meta.url).href
const {default: Workspace} = await import(`data:text/javascript;base64,${Buffer.from(`import {ImuHealth} from "${healthURL}";\nimport {SignalTelemetry} from "${telemetryURL}";\nimport {instrumentStyle} from "${instrumentsURL}";\nimport {clamp, signalLayoutPreset, parseSignalLayout} from "${layoutURL}";\n${source}`).toString("base64")}`)
const view = new Workspace()
for (const name of ["qualityAttitude", "qualityHeading", "qualityReason", "preflightStatus"]) view[`${name}Target`] = {textContent: "", dataset: {}}
for (const name of ["radioStatus", "parserStatus", "dataStatus", "heading", "airspeed", "altitude", "verticalSpeed", "glide", "aircraftLabel"]) view[`${name}Target`] = {textContent: ""}
view.sensorValueTargets = ["accel", "gyro", "mag", "pressure", "temperature", "gps", "gLoad"].map((sensor) => ({dataset: {sensor}, textContent: ""}))
view.streamBadgeTargets = ["charts", "map", "instruments"].map((widget) => ({dataset: {}, textContent: "", closest: () => ({getAttribute: () => widget})}))
view.port = {}
view.drawAll = () => {}
const originalNow = Date.now
let now = 10_000
Date.now = () => now
const frame = (decoded, systemId = 1, componentId = 191) => ({type: "frame", decoded, systemId, componentId, receivedAtUs: String(now * 1000), parser: {errors: 0, ignored: 0, dropped: 0}})
const radio = {name: "radio", rssiDbm: -60}
view.handleWorkerMessage(frame(radio, 51, 68))
assert.equal(view.mavlinkSystemId, null, "radio status cannot resolve the FDR identity")
view.handleWorkerMessage(frame({name: "highres_imu", acceleration: [0, 0, 9.81], angularVelocity: [1, 2, 3], magneticField: [10, 20, 30], differentialPa: 61.25, temperatureC: 24}))
view.handleWorkerMessage(frame({name: "attitude", rollDeg: 10, pitchDeg: 20, yawDeg: 30}))
view.refreshTelemetry()
assert.equal(view.mavlinkSystemId, "1")
assert.equal(view.mavlinkComponentId, "191")
assert.equal(view.airspeedTarget.textContent, "36.0")
assert.equal(view.headingTarget.textContent, "030")
assert.equal(view.sensorValueTargets[0].textContent, "0.00 / 0.00 / 9.81")
assert.equal(view.sensorValueTargets.find(target => target.dataset.sensor === "gLoad").textContent, "1.00", "the live G readout shows the accelerometer magnitude")
assert.equal(view.streamBadgeTargets[0].textContent, "Live")
view.handleWorkerMessage(frame(radio, 51, 68))
assert.equal(view.mavlinkSystemId, "1")
view.handleWorkerMessage(frame({name: "attitude", rollDeg: 100, pitchDeg: 100, yawDeg: 120}, 2))
assert.equal(view.telemetry.heading, 30, "another aircraft must not overwrite the selected source")
const gps = {name: "gps", timeUs: "1000000", latitude: 0, longitude: 0, altitudeM: 100, hdop: null, vdop: null, velocityMps: null, courseDeg: null, satellites: 0, fix: 1}
view.handleWorkerMessage(frame(gps))
view.refreshTelemetry()
assert.equal(view.streamBadgeTargets[1].textContent, "No fix", "a live radio does not imply a usable GPS position")
assert.equal(view.streamBadgeTargets[2].textContent, "Live")
assert.equal(view.pendingSamples.at(-1).kind, "sensor", "no-fix GPS is diagnostics, not a track point")
view.handleWorkerMessage(frame({...gps, fix: 3, hdop: 0.8, vdop: 1.2}))
view.refreshTelemetry()
assert.equal(view.streamBadgeTargets[1].textContent, "Live")
const point = view.pendingSamples.at(-1)
assert.equal(point.kind, "gps")
assert.equal("horizontal_accuracy_m" in point, false, "unitless GPS dilution must not reach the API as metre accuracy")
now += 2_000
view.handleWorkerMessage(frame(radio, 51, 68))
view.refreshTelemetry()
assert.equal(view.streamBadgeTargets[0].textContent, "Stale", "ground-radio status cannot keep the Air link live")
assert.equal(view.airspeedTarget.textContent, "---")
assert.equal(view.headingTarget.textContent, "---")
assert.equal(view.altitudeTarget.textContent, "---")
assert.equal(view.sensorValueTargets.every((target) => target.textContent === "---"), true)
assert.equal(view.history.validity.at(-1), 0)
view.handleWorkerMessage(frame({name: "heartbeat"}))
view.refreshTelemetry()
assert.equal(view.streamBadgeTargets[0].textContent, "Live")
assert.equal(view.streamBadgeTargets[1].textContent, "No data", "heartbeat cannot revive stale GPS")
assert.equal(view.streamBadgeTargets[2].textContent, "No data", "heartbeat cannot revive stale attitude")
const rawPitot = Object.freeze({name: "highres_imu", timeUs: "12000000", differentialPa: 0.715274315606917, temperatureC: 29.5})
view.handleWorkerMessage(frame(rawPitot))
view.refreshTelemetry()
assert.equal(view.airspeedTarget.textContent, "0.0", "the live numeric IAS uses the zero-stabilized display value")
assert.equal(view.telemetry.airspeed, 0, "the instrument receives the same display value")
assert.equal(view.history.airspeed.at(-1), 0, "the chart receives the same display value")
assert.equal(view.sensorValueTargets.find(target => target.dataset.sensor === "pressure").textContent, "0.72", "the pressure strip keeps its raw measurement")
assert.equal(view.pendingSamples.at(-1).readings, rawPitot, "cloud synchronization receives the original decoded payload")
assert.equal(view.pendingSamples.at(-1).readings.differentialPa, 0.715274315606917)
Date.now = originalNow

const charts = new Workspace()
for (const time of [10_000, 10_300, 11_000, 17_000, 40_000]) {
  charts.telemetry.altitude = time / 1000
  charts.pushHistory(true, time)
}
assert.deepEqual(charts.historyTimes, [10_000, 10_300, 11_000, 17_000, 40_000])
const calls = []
const context = new Proxy({}, {
  get: (target, method) => (...args) => calls.push({method, args, stroke: target.strokeStyle}),
  set: (target, key, value) => {target[key] = value; return true}
})
const originalWindow = globalThis.window
const originalComputedStyle = globalThis.getComputedStyle
globalThis.window = {devicePixelRatio: 2}
globalThis.getComputedStyle = () => ({getPropertyValue: (name) => name === "--ex-font-mono" ? "monospace" : name})
charts.chartCanvasTarget = {clientWidth: 510, clientHeight: 282, getContext: () => context}
charts.drawCharts()
const text = calls.filter(c => c.method === "fillText").map(c => c.args[0])
for (const label of ["TIME · 30 s", "-30s", "-20s", "-10s", "NOW"]) assert.ok(text.includes(label), label)
const trace = calls.filter(c => ["moveTo", "lineTo"].includes(c.method) && c.stroke === "--ex-aqua-500")
assert.equal(trace[0].args[0], 120, "the oldest sample is at the left edge of the 30-second window")
assert.ok(Math.abs(trace[1].args[0] - (120 + 376 * .01)) < 0.001, "irregular sample spacing uses elapsed time, not array indices")
assert.equal(trace[3].method, "moveTo", "a suspended render loop leaves a visible gap")
assert.equal(trace[4].args[0], 496, "the newest sample sits at NOW")
assert.ok(calls.every(c => c.args.every(a => typeof a !== "number" || Number.isFinite(a))), "all chart coordinates remain finite")
calls.length = 0
charts.chartCanvasTarget.clientWidth = 1100
charts.drawCharts()
assert.ok(calls.some(c => c.method === "fillText" && c.args[0] === "-25s"), "large charts use five-second ticks")
charts.pushHistory(false, 40_001)
assert.deepEqual(charts.historyTimes, [10_300, 11_000, 17_000, 40_000, 40_001])
assert.ok(Object.values(charts.history).every(values => values.length === charts.historyTimes.length), "time eviction keeps every series aligned")
charts.pushHistory(false, 5_000)
assert.deepEqual(charts.historyTimes, [5_000], "a system-clock correction resets the window instead of reversing time")
globalThis.window = originalWindow
globalThis.getComputedStyle = originalComputedStyle

const originalDOM = Object.fromEntries(["Element", "HTMLElement", "sessionStorage", "requestAnimationFrame"].map(key => [key, globalThis[key]]))
class LayoutElement {
  constructor(dataset, style = {}) { this.dataset = dataset; this.style = style }
  getBoundingClientRect() { return Object.fromEntries(["left", "top", "width", "height"].map(key => [key, parseFloat(this.style[key]) || 0])) }
  querySelectorAll() { return [] }
}
globalThis.Element = globalThis.HTMLElement = LayoutElement
const storedLayouts = new Map()
globalThis.sessionStorage = {getItem: key => storedLayouts.get(key), setItem: (key, value) => storedLayouts.set(key, value)}
globalThis.requestAnimationFrame = callback => callback()
const makeLayout = () => {
  const workspace = new Workspace()
  workspace.layoutStorageKey = "layout-test"
  workspace.boardTarget = {clientWidth: 1700, clientHeight: 800, getBoundingClientRect: () => ({left: 0, top: 0})}
  workspace.widgetTargets = ["map", "instruments", "charts"].map((widget, i) => new LayoutElement(
    {widget, mode: i === 0 ? "large" : "mini"},
    {left: `${i === 0 ? 8 : 1150}px`, top: `${i === 2 ? 410 : 8}px`, width: `${i === 0 ? 1132 : 510}px`, height: `${i === 0 ? 784 : 390}px`}
  ))
  workspace.drawAll = () => {}
  return workspace
}
const mode = (workspace, widget, value) => {
  const button = new LayoutElement({mode: value})
  button.closest = () => widget
  workspace.setMode({currentTarget: button})
}
const panel = makeLayout()
const instrument = panel.widgetTargets[1]
const expected = panel.widgetRect(instrument)
const siblings = [panel.widgetRect(panel.widgetTargets[0]), panel.widgetRect(panel.widgetTargets[2])]
mode(panel, instrument, "mini")
assert.deepEqual(panel.widgetRect(instrument), expected, "selecting the current mode must not shrink the card")
for (let cycle = 0; cycle < 3; cycle++) {
  mode(panel, instrument, "hidden")
  assert.equal(panel.widgetRect(instrument).height, 38)
  assert.equal(panel.widgetRect(instrument).width, expected.width, "hiding only collapses the height")
  mode(panel, instrument, "mini")
  assert.deepEqual(panel.widgetRect(instrument), expected, "reopening restores both original dimensions and position")
}
assert.deepEqual([panel.widgetRect(panel.widgetTargets[0]), panel.widgetRect(panel.widgetTargets[2])], siblings, "toggling a card does not move its neighbours")
mode(panel, instrument, "hidden")
const restored = makeLayout()
restored.restoreLayout()
assert.equal(restored.widgetTargets[1].dataset.mode, "hidden")
mode(restored, restored.widgetTargets[1], "mini")
assert.deepEqual(restored.widgetRect(restored.widgetTargets[1]), expected, "a reload while hidden retains the expanded mini dimensions")
mode(restored, restored.widgetTargets[1], "hidden")
restored.boardTarget.clientWidth = 400
restored.boardTarget.clientHeight = 300
mode(restored, restored.widgetTargets[1], "mini")
assert.deepEqual(restored.widgetRect(restored.widgetTargets[1]), {left: 0, top: 0, width: 400, height: 300}, "restored dimensions stay inside a smaller viewport")
const legacy = makeLayout()
legacy.widgetTargets[1].dataset.mode = "hidden"
legacy.widgetTargets[1].style.height = "38px"
mode(legacy, legacy.widgetTargets[1], "mini")
assert.equal(legacy.widgetRect(legacy.widgetTargets[1]).height, 320, "old hidden layouts without a remembered size get a usable fallback")
for (const [key, value] of Object.entries(originalDOM)) {
  if (value === undefined) delete globalThis[key]
  else globalThis[key] = value
}
console.log("Signal source selection, GPS safety, lost-link rendering, timestamp-aligned charts and mini-card restoration tests passed")
