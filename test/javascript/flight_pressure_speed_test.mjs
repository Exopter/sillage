import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {isFiniteNumber, median} from "../../app/javascript/lib/flight_geometry.js"
const source = readFileSync(new URL("../../app/javascript/controllers/flight_viewer_controller.js", import.meta.url), "utf8")
const body = source.split("  robustPressureVerticalSpeed(samples, index) {\n")[1].split("\n  }\n")[0]
const calculate = new Function("isFiniteNumber", `return function(samples, index) {${body}}`)(isFiniteNumber)
const context = {number: (value) => value == null ? null : Number(value), median, cleanTrajectorySpeed: (value) => value != null && Math.abs(value) <= 140 ? value : null}
function reference(samples, index) {
  const rows = samples.filter((row) => Math.abs(row.t - samples[index].t) <= 2)
  const slopes = []
  rows.forEach((start, i) => rows.slice(i + 1).forEach((end) => {
    if (end.t - start.t >= 0.25) slopes.push((start.readings.pressure_altitude_m - end.readings.pressure_altitude_m) / (end.t - start.t))
  }))
  return context.cleanTrajectorySpeed(median(slopes))
}
// Include duplicate times, exact window boundaries, gaps and a rejected spike.
const samples = Array.from({length: 250}, (_, i) => ({t: Math.floor(i / 2) * 0.25 + (i > 130 ? 5 : 0), readings: {pressure_altitude_m: i === 85 ? 50_000 : 4000 - i * 3 + Math.sin(i)}}))
for (let i = 0; i < samples.length; i += 1) assert.equal(calculate.call(context, samples, i), reference(samples, i))
assert.equal(calculate.call(context, [samples[0]], 0), null)
console.log("Pressure speed window parity, gaps, duplicate times and outlier tests passed")
