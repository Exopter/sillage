import assert from "node:assert/strict"
import {drawSignalInstruments, instrumentTapeTicks, normalizeHeading} from "../../app/javascript/lib/signal_instruments.js"

assert.equal(normalizeHeading(-1), 359)
assert.equal(normalizeHeading(360), 0)
const ticks = instrumentTapeTicks(152, 10, 30, 100, 20, 180, 0)
assert.ok(ticks.find(t => t.value === 160).y < 100, "higher speed values sit above the current value")
assert.ok(ticks.find(t => t.value === 150).y > 100, "lower speed values sit below the current value")
const moved = instrumentTapeTicks(155, 10, 30, 100, 20, 180, 0)
assert.ok(moved.find(t => t.value === 150).y > ticks.find(t => t.value === 150).y, "fixed graduation values scroll continuously as measurements increase")
assert.ok(instrumentTapeTicks(1, 10, 30, 100, 20, 180, 0).every(t => t.value >= 0), "airspeed cannot acquire negative ticks")
assert.ok(instrumentTapeTicks(-50, 100, 30, 100, 20, 180).some(t => t.value < 0), "GPS AMSL altitude supports below-sea-level values")
assert.deepEqual(instrumentTapeTicks(null, 10, 30, 100, 20, 180), [])

const style = {background: "#070b0d", surface: "#10181a", sky: "#102936", ground: "#151f20", line: "#53676d", muted: "#95a6aa", text: "#f5f8f6", reference: "#2fd6c6", caution: "#f2a23a", font: "monospace"}
const readings = {heading: 359.8, roll: 30, pitch: 10, airspeed: 152, altitude: 1432, verticalSpeed: -12.3, gLoad: 1.27}
function render(data, width = 510, height = 282) {
  const calls = []
  const ctx = new Proxy({}, {get: (_target, method) => (...args) => calls.push({method, args}), set: () => true})
  drawSignalInstruments(ctx, width, height, data, style)
  assert.equal(calls.filter(c => c.method === "save").length, calls.filter(c => c.method === "restore").length, "canvas transforms are restored between frames")
  assert.ok(calls.every(c => c.args.every(a => typeof a !== "number" || Number.isFinite(a))), "all rendering coordinates stay finite")
  return calls
}
const calls = render(readings)
const text = calls.filter(c => c.method === "fillText").map(c => c.args[0])
for (const label of ["000°", "N", "IAS EST", "GPS ALT", "m AMSL", "152", "1432", "+30.0°", "+10.0°", "G LOAD", "1.27 g", "-12.3 m/s"]) assert.ok(text.includes(label), label)
assert.ok(calls.find(c => c.method === "rotate").args[0] < 0, "right bank tilts the world left")
assert.ok(calls.some(c => c.method === "translate" && c.args[0] === 0 && c.args[1] > 0), "positive pitch moves the horizon down")
const negative = render({...readings, roll: -30, pitch: -10})
assert.ok(negative.find(c => c.method === "rotate").args[0] > 0)
assert.ok(negative.some(c => c.method === "translate" && c.args[0] === 0 && c.args[1] < 0))
const unavailable = render({...readings, roll: null, pitch: null, airspeed: null})
const unavailableText = unavailable.filter(c => c.method === "fillText").map(c => c.args[0])
assert.ok(unavailableText.includes("NO DATA"))
assert.ok(unavailableText.includes("1432"), "loss of attitude must not hide valid GPS altitude")
assert.ok(unavailableText.includes("000°"), "loss of attitude must not hide an independent heading")
assert.equal(unavailable.some(c => c.method === "rotate"), false, "missing attitude never renders a fake level horizon")
for (const [width, height] of [[380, 250], [510, 282], [1100, 650]]) render(readings, width, height)
console.log("Signal instrument heading wrap, scrolling scales, attitude direction, independent missing data and canvas lifecycle tests passed")
