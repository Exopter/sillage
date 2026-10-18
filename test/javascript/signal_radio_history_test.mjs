import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"

const source = (await readFile(new URL("../../app/javascript/controllers/signal_radio_history_controller.js", import.meta.url), "utf8"))
  .replace(/^import .*$/gm, "")
  .replace(/const TypedController = .*$/m, "const TypedController = class {}")
const {default: History, radioSeries} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const rows = [{elapsed_seconds: 1, ground_dbm: -57}, {elapsed_seconds: 2, ground_dbm: null},
  {elapsed_seconds: 3, ground_dbm: -80}, {elapsed_seconds: 30, ground_dbm: -60}]
assert.deepEqual(radioSeries(rows, "ground_dbm"), [{x: 1, y: -57}, {x: 2, y: null}, {x: 3, y: -80}, {x: 3.001, y: null}, {x: 30, y: -60}])
assert.equal(rows.length, 4, "chart gaps must not mutate source reports")
const history = new History()
let destroyed = 0
history.chart = {destroy() { destroyed++ }}
history.disconnect()
history.disconnect()
assert.equal(destroyed, 1)
assert.equal(history.generation, 2, "disconnect invalidates asynchronous chart loading")
assert.equal(history.chart, null)
history.hasChartTarget = false
await history.connect()
assert.equal(history.chart, null, "empty histories do not load chart dependencies")
const button = {dataset: {datasetIndex: "1"}, setAttribute(name, value) { this[name] = value }}
let visible = true
let updates = 0
history.chart = {
  isDatasetVisible(index) { assert.equal(index, 1); return visible },
  setDatasetVisibility(index, value) { assert.equal(index, 1); visible = value },
  update(mode) { assert.equal(mode, "none"); updates++ }
}
history.toggleMetric({currentTarget: button})
assert.equal(visible, false)
assert.equal(button["aria-pressed"], "false")
history.toggleMetric({currentTarget: button})
assert.equal(visible, true)
assert.equal(button["aria-pressed"], "true")
assert.equal(updates, 2, "accessible legend updates only the selected chart")
console.log("Signal radio history preserves missing data, report gaps and chart lifecycle")
