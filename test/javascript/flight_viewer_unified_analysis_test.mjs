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

console.log("Unified flight analysis tests passed")
