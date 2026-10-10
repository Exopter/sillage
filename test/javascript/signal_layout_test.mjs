import assert from "node:assert/strict"

import { signalLayoutPreset, parseSignalLayout } from "../../app/javascript/lib/signal_layout.js"

const layout = signalLayoutPreset(1_200, 800, [
  { id: "map", mode: "large" },
  { id: "instruments", mode: "mini" },
  { id: "charts", mode: "hidden" }
], "map")

assert.deepEqual(layout.map, { left: 8, top: 8, width: 806, height: 784 })
assert.equal(layout.instruments.left, 824)
assert.equal(layout.instruments.top, 8)
assert.equal(layout.charts.height, 38)
assert.ok(layout.instruments.height >= 150)

const hidden = {left: 8, top: 8, width: 510, height: 38, mode: "hidden"}
const remembered = {width: 510, height: 390}
assert.deepEqual(parseSignalLayout(JSON.stringify({instruments: {...hidden, miniSize: remembered}})).widgets.instruments.miniSize, remembered)
for (const miniSize of [null, {}, {width: 510, height: 38}, {width: -1, height: 390}, {width: "510", height: 390}]) {
  assert.equal(parseSignalLayout(JSON.stringify({instruments: {...hidden, miniSize}})).widgets.instruments.miniSize, undefined)
}
