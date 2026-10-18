import assert from "node:assert/strict"

import {
  clamp,
  finiteNumber,
  median,
  normalizeFlightPoints,
  flightSegments,
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

const broken = normalizeFlightPoints([
  { t: 0, lat: 45, lon: 2, alt: 1200, segment: 0 },
  { t: 1, lat: 45, lon: 2, alt: 1180, segment: 0 },
  { t: 2, lat: 45, lon: 2, alt: 1500, segment: 1 },
  { t: 3, lat: 45, lon: 2, alt: 1480, segment: 1 }
])
assert.equal(sampleFlightPoint(1.5, broken), null, "replay must not interpolate a climb across a GPS discontinuity")
assert.equal(sampleFlightPoint(1, broken).alt, 1180)
assert.equal(sampleFlightPoint(2, broken).alt, 1500)
assert.equal(sampleFlightPoint(2.5, broken).alt, 1490)
assert.deepEqual(flightSegments(broken).map((segment) => segment.length), [2, 2])
