import assert from "node:assert/strict"

import {
  clamp,
  finiteNumber,
  median,
  sampleFlightPoint,
  sampleSensorValue
} from "../../app/javascript/lib/flight_geometry.js"

assert.equal(finiteNumber("12.5"), 12.5)
assert.equal(finiteNumber("invalid"), null)
assert.equal(clamp(12, 0, 10), 10)
assert.equal(median([4, 1, 3, 2]), 2.5)

const points = [
  { t: 0, lat: 44, lon: 1, alt: 1_000 },
  { t: 10, lat: 46, lon: 3, alt: 2_000 }
]
assert.deepEqual(sampleFlightPoint(5, points), { t: 5, lat: 45, lon: 2, alt: 1_500 })
assert.deepEqual(sampleFlightPoint(15, points), { t: 15, lat: 46, lon: 3, alt: 2_000 })

const rows = [
  { t: 0, readings: { pressure_altitude_m: 1_000 } },
  { t: 10, readings: { pressure_altitude_m: 2_000 } }
]
assert.equal(sampleSensorValue(5, rows, "pressure_altitude_m").value, 1_500)
