import assert from "node:assert/strict"
import { formatLocalTime } from "../../app/javascript/lib/local_time.js"

// One instant, read in the viewer's zone: 10:27:05 UTC is 11:27:05 in Paris in winter.
const instant = new Date("2026-11-16T10:27:05Z")
assert.equal(formatLocalTime(instant, "long", "Europe/Paris"), "16 Nov 2026, 11:27")
assert.equal(formatLocalTime(instant, "seconds", "Europe/Paris"), "16 Nov 2026, 11:27:05")
assert.equal(formatLocalTime(instant, "list", "Europe/Paris"), "16 Nov 2026 \u00b7 11:27")
assert.equal(formatLocalTime(instant, "short", "Europe/Paris"), "16 Nov \u00b7 11:27")
assert.equal(formatLocalTime(instant, "time", "Europe/Paris"), "11:27:05")
assert.equal(formatLocalTime(instant, "date", "Europe/Paris"), "16 Nov 2026")
assert.equal(formatLocalTime(instant, "long", "UTC"), "16 Nov 2026, 10:27")
// The date follows the zone too, and midnight is 00, never 24.
assert.equal(formatLocalTime(new Date("2026-11-16T23:30:00Z"), "list", "Europe/Paris"), "17 Nov 2026 \u00b7 00:30")
assert.equal(formatLocalTime(new Date("2026-07-01T22:15:00Z"), "long", "Europe/Paris"), "02 Jul 2026, 00:15")
assert.equal(formatLocalTime(instant, "unknown", "UTC"), "16 Nov 2026, 10:27")
assert.equal(formatLocalTime(new Date("2026-09-23T13:57:54Z"), "date", "Europe/Paris"), "23 Sep 2026")
console.log("Local time formatting passed")
