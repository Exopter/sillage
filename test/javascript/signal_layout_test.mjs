import assert from "node:assert/strict"

import { signalLayoutPreset } from "../../app/javascript/lib/signal_layout.js"

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
