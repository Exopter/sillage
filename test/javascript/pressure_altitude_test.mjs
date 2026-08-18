import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { pressureAltitudeFromPascals } from "../../app/javascript/lib/pressure_altitude.js"

const cases = JSON.parse(await readFile(new URL("../fixtures/files/pressure_altitude_cases.json", import.meta.url)))

for (const example of cases) {
  const altitude = pressureAltitudeFromPascals(example.pressure_pa)
  assert.ok(Math.abs(altitude - example.altitude_m) <= 0.001)
}

for (const value of [ null, "", "invalid", Number.NaN, Number.POSITIVE_INFINITY, 0, -1 ]) {
  assert.equal(pressureAltitudeFromPascals(value), null)
}
