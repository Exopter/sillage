import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { OS_PLAYBACK_PLUGIN } from "../../app/javascript/lib/flight_chart_plugins.js"

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

assert.match(controllerSource, /setupUnifiedChart\(\)/)
for (const obsoleteMethod of [
  "setupProfileChart",
  "setupGroundChart",
  "setupPerformanceChart",
  "setupMotionChart",
  "setupDynamicsChart",
  "setupEnvironmentChart",
  "setupPowerChart",
  "elapsedFromTrackChartPosition",
  "chartCursorMode",
  "sizeChartCanvas",
  "flightDurationFromExit",
  "timelineSpan"
]) {
  assert.doesNotMatch(controllerSource, new RegExp(`${obsoleteMethod}\\(`))
}
assert.doesNotMatch(controllerSource, /responsive: true/)
assert.doesNotMatch(controllerSource, /interaction: \{ mode: "nearest"/)
assert.doesNotMatch(controllerSource, /mode: cursorMode/)
assert.match(controllerSource, /all: \[ start, end \]/)
assert.match(controllerSource, /plane: this\.validPhaseRange\(start, exit/)
assert.match(controllerSource, /jump: this\.validPhaseRange\(exit, opening/)
assert.match(controllerSource, /canopy: this\.validPhaseRange\(opening, landing/)
assert.match(controllerSource, /this\.updateChartsPlaybackCursor\(clampedElapsed\)/)
assert.match(controllerSource, /playback\.elapsed = elapsed/)
assert.match(controllerSource, /setAverageMaximumStat\("horizontal-speed", horizontalSpeeds, 0\)/)
assert.match(controllerSource, /setAverageMaximumStat\("vertical-speed", verticalSpeeds, 0\)/)
assert.match(controllerSource, /setAverageMaximumStat\("airspeed", airspeeds, 0\)/)
assert.match(controllerSource, /setAverageMaximumStat\("total-speed", totalSpeeds, 0\)/)
assert.match(controllerSource, /setStat\("glide", this\.formatAverage\(glideRatios, 1\)\)/)
assert.doesNotMatch(controllerSource, /Glide · L\/D|formatAverageMaximum\(glideRatios|"L\/D"/)
assert.match(flightViewSource, /data-flight-viewer-target="unifiedChart"/)
assert.match(flightViewSource, /class="flight-analysis-visuals"/)
assert.match(flightViewSource, /class="trajectory trajectory-compact"/)
assert.match(flightViewSource, /class="flight-speed-pill is-average"/)
assert.match(flightViewSource, /class="flight-speed-pill is-maximum"/)
assert.match(flightViewSource, /\["plane", "Plane"\]/)
assert.match(flightViewSource, /\["jump", "Jump"\]/)
assert.match(flightViewSource, /\["canopy", "Canopy"\]/)
assert.doesNotMatch(flightViewSource, /Freefall/)
assert.doesNotMatch(flightViewSource, /Start altitude|End altitude|Altitude change/)
assert.match(applicationStyles, /\.sillage-rail\s*\{[\s\S]*?background: var\(--ex-carbon-950\)/)
assert.match(applicationStyles, /\.sillage-topbar\s*\{[\s\S]*?background: var\(--ex-carbon-900\)/)
assert.match(applicationStyles, /\.flight-replay-header\s*\{[\s\S]*?top: 57px;[\s\S]*?z-index: 19;/)
assert.doesNotMatch(applicationStyles, /\.flight-analysis-theme \.sillage-(?:rail|topbar|room-link|breadcrumb|title-block|account|avatar)/)
assert.doesNotMatch(applicationStyles, /\.flight-analysis-theme \.aircraft-connection-pill/)
assert.doesNotMatch(applicationStyles, /\.chart-panel\[hidden\]/)

const runtimeSource = controllerSource
  .replace('import { Controller } from "@hotwired/stimulus"', "const Controller = class {}")
  .replace(/from "(flight_geometry|flight_chart_plugins|pressure_altitude|viewer_resources)"/g,
    (_, name) => `from "${new URL(`../../app/javascript/lib/${name}.js`, import.meta.url).href}"`)
const { default: Viewer } = await import(`data:text/javascript;base64,${Buffer.from(runtimeSource).toString("base64")}`)

const drawnMarkers = []
let activeCursorElements = []
let tooltipCursorElements = []
const cursorChart = {
  data: { datasets: [
    { metric: "altitude", data: [{ x: 0, y: 80 }, { x: 10, y: 70 }], hidden: false },
    { metric: "airspeed", data: [], hidden: true },
    { metric: "horizontal-speed", data: [{ x: 0, y: 40 }, { x: 10, y: 30 }], hidden: false },
    { metric: "total-speed", data: [{ x: 0, y: 50 }, { x: 10, y: 45 }], hidden: true },
    { metric: "vertical-speed", data: [{ x: 0, y: 20 }, { x: 10, y: 15 }], hidden: false }
  ] },
  options: { plugins: { osPlayback: { elapsed: 0 } } },
  chartArea: { left: 0, right: 100, top: 0, bottom: 100 },
  scales: { x: { getPixelForValue: (value) => value } },
  isDatasetVisible(index) { return !this.data.datasets[index].hidden },
  setDatasetVisibility(index, visible) { this.data.datasets[index].hidden = !visible },
  getDatasetMeta(index) { return { data: this.data.datasets[index].data } },
  setActiveElements(elements) { activeCursorElements = elements },
  getActiveElements() { return activeCursorElements },
  tooltip: { setActiveElements(elements) { tooltipCursorElements = elements } },
  ctx: { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc(x, y) { drawnMarkers.push({ x, y }) } },
  update() {
    drawnMarkers.length = 0
    OS_PLAYBACK_PLUGIN.afterDatasetsDraw(this, {}, this.options.plugins.osPlayback)
  }
}
const cursorViewer = Object.assign(new Viewer(), { charts: [cursorChart] })
function assertCursorMetrics(indices) {
  const expected = indices.map((datasetIndex) => ({ datasetIndex, index: 1 }))
  assert.deepEqual(activeCursorElements, expected, "the playhead activates only visible curves at their original indices")
  assert.deepEqual(tooltipCursorElements, expected, "the tooltip matches the visible playhead markers")
  assert.deepEqual(drawnMarkers, indices.map((index) => cursorChart.data.datasets[index].data[1]))
}
cursorViewer.updateChartsPlaybackCursor(9)
assertCursorMetrics([0, 2, 4])
cursorChart.setDatasetVisibility(3, true)
cursorViewer.updateChartsPlaybackCursor(9)
assertCursorMetrics([0, 2, 3, 4])
cursorChart.setDatasetVisibility(3, false)
cursorChart.update()
assert.equal(drawnMarkers.length, 3, "a hidden curve cannot leave a stale marker before the next cursor update")
cursorChart.setDatasetVisibility(0, false)
cursorViewer.updateChartsPlaybackCursor(9)
assertCursorMetrics([2, 4])
cursorChart.data.datasets.forEach((_dataset, index) => cursorChart.setDatasetVisibility(index, false))
cursorViewer.updateChartsPlaybackCursor(9)
assertCursorMetrics([])

const expandedAttributes = new Map()
const layoutClasses = new Set()
let chartResizes = 0
let sceneResizes = 0
const layoutViewer = Object.assign(new Viewer(), {
  analysisVisualsTarget: { classList: { toggle(name, enabled) { enabled ? layoutClasses.add(name) : layoutClasses.delete(name) } } },
  instrumentPanelTarget: { classList: { toggle() {} } },
  analysisTitleTarget: {},
  expandButtonTarget: { setAttribute(name, value) { expandedAttributes.set(name, value) } },
  charts: [{ resize() { chartResizes += 1 } }],
  cesiumViewer: { resize() { sceneResizes += 1 }, scene: { requestRender() {} } },
  activePhase: "canopy", currentElapsed: 120, isPlaying: true,
  cesiumOrbit: { heading: 2, pitch: -0.5, range: 1500 }
})
const originalOrbit = layoutViewer.cesiumOrbit
for (const expanded of [true, false]) {
  layoutViewer.toggleExpanded()
  assert.equal(layoutClasses.has("is-expanded"), expanded)
  assert.equal(expandedAttributes.get("aria-expanded"), String(expanded))
  assert.equal(expandedAttributes.get("aria-label"), expanded ? "Collapse 3D" : "Expand 3D")
  assert.equal(layoutViewer.activePhase, "canopy")
  assert.equal(layoutViewer.currentElapsed, 120)
  assert.equal(layoutViewer.isPlaying, true)
  assert.equal(layoutViewer.cesiumOrbit, originalOrbit, "resizing preserves the camera")
}
assert.equal(chartResizes, 2)
assert.equal(sceneResizes, 2)

const wheelListeners = []
const mouseActions = new Map()
let wheelCameraMoves = 0
const wheelViewer = Object.assign(new Viewer(), {
  cesiumOrbit: { range: 100, minRange: 40, maxRange: 200 },
  addSceneHandler(type, action, target, options) { wheelListeners.push({ type, action, options }) },
  applyCesiumOrbit() { wheelCameraMoves += 1 }
})
wheelViewer.setupCesiumMouseControls({
  ScreenSpaceEventHandler: class { setInputAction(action, type) { mouseActions.set(type, action) } },
  ScreenSpaceEventType: { LEFT_DOWN: "down", MOUSE_MOVE: "move", LEFT_UP: "up", LEFT_DOUBLE_CLICK: "double", WHEEL: "wheel" }
}, { scene: { canvas: {} } })
const wheelListener = wheelListeners.find(({ type }) => type === "wheel")
assert.deepEqual(wheelListener.options, { capture: true, passive: false }, "intercept before Cesium cancels browser scrolling")
assert.equal(mouseActions.has("wheel"), false, "no second Cesium wheel action can bypass the Cmd requirement")
function dispatchWheel(properties) {
  const event = { deltaY: 100, metaKey: false, prevented: false, stopped: false,
    preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true }, ...properties }
  wheelListener.action(event)
  return event
}
for (const modifier of [{}, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
  const event = dispatchWheel(modifier)
  assert.equal(event.prevented, false, "without Cmd the page can scroll")
  assert.equal(event.stopped, true, "Cesium cannot swallow the ordinary scroll")
  assert.equal(wheelViewer.cesiumOrbit.range, 100)
}
assert.equal(dispatchWheel({ metaKey: true, deltaY: -100 }).prevented, true)
assert.equal(wheelViewer.cesiumOrbit.range, 88, "Cmd + wheel up zooms in")
assert.equal(dispatchWheel({ metaKey: true, deltaY: 100 }).prevented, true)
assert.ok(wheelViewer.cesiumOrbit.range > 88, "Cmd + wheel down zooms out")
const previousRange = wheelViewer.cesiumOrbit.range
assert.equal(dispatchWheel({ metaKey: true, deltaY: 0 }).prevented, false)
assert.equal(wheelViewer.cesiumOrbit.range, previousRange)
wheelViewer.cesiumOrbit.range = 40
dispatchWheel({ metaKey: true, deltaY: -100 })
assert.equal(wheelViewer.cesiumOrbit.range, 40)
wheelViewer.cesiumOrbit.range = 200
dispatchWheel({ metaKey: true, deltaY: 100 })
assert.equal(wheelViewer.cesiumOrbit.range, 200)
assert.equal(wheelCameraMoves, 4)

const previousWindow = globalThis.window
globalThis.window = { Cesium: {
  Cartesian3: { fromDegrees: (lon, lat, alt) => ({ lon, lat, alt }) },
  ConstantPositionProperty: class { constructor(position) { this.position = position } }
} }
let cameraMoves = 0
const trackingViewer = Object.assign(new Viewer(), {
  phaseStart: () => 0, phaseEnd: () => 200,
  telemetryPointAtElapsed: (t) => ({ t }),
  coordinatePointAtElapsed: (t) => ({ t, lat: 44, lon: 1, alt: 100 }),
  cesiumPoints: () => [], cesiumAltitude: (point) => point.alt,
  cesiumMarker: {}, cesiumViewer: { scene: { requestRender() {} } },
  cesiumOrbitHome: { targetPoint: { t: 0 }, heading: 0, pitch: -0.3, range: 1500 },
  cesiumOrbit: { targetPoint: { t: 0 }, heading: 2, pitch: -0.5, range: 500 },
  applyCesiumOrbit() { cameraMoves += 1 }, syncVideoToElapsed() {},
  elapsedFromChartEvent: () => 30
})
trackingViewer.updateScrubbedElapsed(20)
assert.equal(trackingViewer.cesiumOrbit.targetPoint.t, 20)
assert.equal(trackingViewer.cesiumOrbit.heading, 2, "tracking preserves the user's orbit angle")
assert.equal(trackingViewer.cesiumOrbit.range, 500, "tracking preserves the user's zoom")
trackingViewer.updateFromChartEvent({}, {})
assert.equal(trackingViewer.cesiumOrbit.targetPoint.t, 30, "the camera follows chart scrubbing too")
trackingViewer.resetCamera()
assert.equal(trackingViewer.cesiumOrbit.targetPoint.t, 30, "reset stays centered on the current position")
assert.equal(cameraMoves, 3)
if (previousWindow === undefined) delete globalThis.window
else globalThis.window = previousWindow

const points = [
  { t: 0, lat: 44, lon: 1, alt: 1000, hspeed: 20, vspeed: 5 },
  { t: 10, lat: 44.1, lon: 1, alt: 200, hspeed: 10, vspeed: 5 },
  { t: 20, lat: 44.2, lon: 1, alt: 100, hspeed: 0, vspeed: 0 },
  { t: 100, lat: 45, lon: 2, alt: 100, hspeed: 40, vspeed: 0 }
]
const samples = [
  { t: 10, type: "AIRSPEED", readings: { airspeed_m_s: 10 } },
  { t: 100, type: "AIRSPEED", readings: { airspeed_m_s: 100 } }
]
const viewer = Object.assign(new Viewer(), {
  pointsValue: points, sensorsValue: samples, hasAnalysisValue: true,
  analysisValue: { timeline_start: 0, timeline_end: 100 },
  boundsValue: { exit: 2, opening: 8, landing: 15 },
  phaseButtonTargets: [], statTargets: [],
  hasScrubberTarget: true, scrubberTarget: {},
  designColors: () => ({}), installTooltipPositioner: () => false,
  loadCharts: async () => ({ Chart: { register() {} }, registerables: [] }),
  setupCharts() {}, updatePlayButton() {}, updateVideoExitLabel() {}
})
await viewer.connect()
assert.deepEqual(viewer.phaseRanges(), { all: [0, 15], plane: [0, 2], jump: [2, 8], canopy: [8, 15] })
assert.deepEqual(viewer.points.map((point) => point.t), [0, 10, 15], "the 3D path ends at the interpolated touchdown")
assert.equal(viewer.points.at(-1).alt, 150)
assert.deepEqual(viewer.sensors.map((sample) => sample.t), [10], "ground sensor samples are hidden too")
assert.equal(points.length, 4, "the original recording remains intact")
assert.equal(samples.length, 2)
viewer.updateScrubbedElapsed(100)
assert.equal(viewer.currentElapsed, 15, "scrubbing cannot continue into the ground recording")
assert.equal(viewer.scrubberTarget.value, "1000")
const statistics = {}
viewer.setAverageMaximumStat = (key, values) => { statistics[key] = values }
viewer.updatePhaseStatistics()
assert.equal(Math.max(...statistics["horizontal-speed"]), 72, "All statistics exclude the later car journey")
assert.equal(Math.max(...statistics.airspeed), 36)

viewer.isPlaying = true
viewer.playbackStartElapsed = 14
viewer.playbackStartedAt = 0
viewer.stepPlayback(2000)
assert.equal(viewer.currentElapsed, 15)
assert.equal(viewer.isPlaying, false, "replay stops at touchdown")

viewer.hasVideoTarget = true
viewer.videoExitOffset = 0
viewer.videoTarget = { paused: false, ended: false, currentTime: 20, duration: 120, readyState: 4, pause() { this.paused = true } }
viewer.isPlaying = true
viewer.stepVideoPlayback(2000)
assert.equal(viewer.videoTarget.currentTime, 13)
assert.equal(viewer.videoTarget.paused, true, "synchronized video stops at the same touchdown boundary")
assert.equal(viewer.isPlaying, false)

for (const landing of [undefined, null, NaN, -10, 0, 5]) {
  viewer.boundsValue = { opening: 8, landing }
  assert.equal(viewer.timelineEndFromData(), 100, "unavailable or invalid touchdown retains the recording")
}
viewer.boundsValue = { landing: 200 }
assert.equal(viewer.timelineEndFromData(), 100, "the cutoff cannot exceed the recording")

console.log("Unified flight analysis tests passed")
