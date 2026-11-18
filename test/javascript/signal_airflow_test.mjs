import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const instrumentsURL = new URL("../../app/javascript/lib/signal_instruments.js", import.meta.url).href
const source = (await readFile(new URL("../../app/javascript/controllers/signal_airflow_controller.js", import.meta.url), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/^const TypedController = .*$/m, "const TypedController = class {}")
const {default: Airflow} = await import(`data:text/javascript;base64,${Buffer.from(`import {headingOffset} from "${instrumentsURL}";\n${source}`).toString("base64")}`)

const widget = new Airflow()
/** @type {Record<string, {textContent: string, dataset: {reading: string}}>} */
const readings = Object.fromEntries(["toAirflow", "pitch", "roll", "yaw", "lift", "liftNeeded"].map(reading => [reading, {textContent: "", dataset: {reading}}]))
widget.valueTargets = Object.values(readings)
widget.statusTarget = {hidden: false, textContent: ""}
widget.hasFaceButtonTarget = true
widget.faceButtonTarget = {disabled: false}
const applied = []
widget.scene = {forces: {cl: 0.5}, setAttitude: attitude => applied.push(attitude)}
const telemetry = detail => widget.telemetry({detail: {roll: 2, pitch: -10, pressure: 400, ...detail}})

telemetry({heading: 350})
assert.equal(applied.at(-1).yaw, 0, "yaw starts at the first heading received")
assert.equal(readings.yaw.textContent, "+0.0")
assert.equal(widget.faceButtonTarget.disabled, false)
telemetry({heading: 20})
assert.equal(applied.at(-1).yaw, 30, "a turn through north stays continuous")
assert.equal(readings.yaw.textContent, "+30.0")
telemetry({heading: 335})
assert.equal(applied.at(-1).yaw, -15)
assert.equal(readings.yaw.textContent, "−15.0")
widget.faceAirflow()
assert.equal(applied.at(-1).yaw, 0, "facing the airflow zeroes the yaw at the current heading")
assert.deepEqual([applied.at(-1).roll, applied.at(-1).pitch], [2, -10])
telemetry({heading: 345})
assert.equal(applied.at(-1).yaw, 10)
telemetry({heading: null})
assert.equal(applied.at(-1).yaw, 0, "without a heading the wing stays aligned in yaw")
assert.equal(readings.yaw.textContent, "---")
assert.equal(readings.roll.textContent, "+2.0")
assert.equal(widget.faceButtonTarget.disabled, true)
telemetry({heading: 345})
assert.equal(applied.at(-1).yaw, 10, "the airflow reference survives a heading dropout")
telemetry({roll: null, heading: 345})
assert.equal(applied.at(-1), null)
assert.equal(widget.faceButtonTarget.disabled, true)
console.log("Signal airflow yaw reference, wrap, recentring and missing heading tests passed")
