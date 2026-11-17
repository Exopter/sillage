import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { WingAero, stationSample } from "../../app/javascript/lib/wing_aero.js"

const rad = Math.PI / 180

// A flat rectangular wing of aspect ratio 6 has known lifting-surface results.
const samples = 17
const flat = { samples, stations: Array.from({ length: 30 }, (_, i) => ({ x: i * 0.1, le: -0.5, te: 0.5, yu: Array(samples).fill(0), yl: Array(samples).fill(0) })) }
const reference = new WingAero(flat, { body: null })
const five = reference.solve(0, Math.sin(5 * rad), Math.cos(5 * rad))
const slope = five.cl / (5 * rad)
assert.ok(slope > 4.1 && slope < 4.6, `lift slope ${slope.toFixed(3)} per radian is outside the accepted range for aspect ratio 6`)
assert.ok(five.centreFraction > 0.2 && five.centreFraction < 0.28, "the centre of lift of a flat wing sits near the quarter chord")
const efficiency = five.cl ** 2 / (Math.PI * 6 * five.cdi)
assert.ok(efficiency > 0.9 && efficiency < 1.1, `span efficiency ${efficiency.toFixed(3)} is not close to 1`)
assert.ok(Math.abs(reference.solve(0, 0, 1).cl) < 1e-9, "a flat wing aligned with the wind carries no lift")

// The sections cut from the wing model.
const sections = JSON.parse(readFileSync(new URL("../../app/assets/images/blueprints/exowing-sections.json", import.meta.url), "utf8"))
const wing = new WingAero(sections)
assert.equal(sections.stations.length, 30)
assert.ok(Math.abs(wing.halfSpan - 3) < 0.05, "the wing model spans six units")
const low = wing.solve(0, Math.sin(2 * rad), Math.cos(2 * rad)), high = wing.solve(0, Math.sin(8 * rad), Math.cos(8 * rad))
assert.ok(high.cl > low.cl && low.cl > 0, "lift grows with the angle between the wing and the airflow")
assert.ok(high.cdi > low.cdi && low.cdi > 0, "induced drag grows with lift")
assert.ok(Math.abs(high.alpha - 8 * rad) < 1e-9)
const left = high.loading[4], right = high.loading[high.loading.length - 5]
assert.ok(Math.abs(left - right) < 1e-6 * Math.abs(left), "a symmetric flow loads both half wings equally")
const slipped = wing.solve(Math.sin(6 * rad), Math.sin(5 * rad), 1)
assert.ok(Math.abs(slipped.loading[4] - slipped.loading[slipped.loading.length - 5]) > 1e-3, "sideslip loads the half wings differently")

// Smoke never enters the wing volume: the surface lookup bounds it.
const surface = wing.surface(1.5, 0, stationSample())
assert.ok(surface && surface.upper > surface.lower, "the wing has thickness inside its planform")
assert.equal(wing.surface(3.5, 0, stationSample()), null, "no surface beyond the wing tip")
assert.equal(wing.surface(1.5, 4, stationSample()), null, "no surface behind the trailing edge")

// Far upstream the flow is the free stream.
const v = wing.velocity(0, 0, -200, [0, 0, 0])
assert.ok(Math.hypot(v[0] - wing.wind[0], v[1] - wing.wind[1], v[2] - wing.wind[2]) < 1e-3)
console.log("Wing airflow model verified against a reference wing and the wing sections.")
