import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {SignalTelemetry} from "../../app/javascript/lib/signal_telemetry.js"

const stream = new SignalTelemetry()
const imu = {name: "highres_imu", acceleration: [0, 0, 9.81], angularVelocity: [0.1, 0.2, 0.3], magneticField: [20, -3, 40], differentialPa: 61.25, temperatureC: 22}
stream.apply(imu, 1_000)
let state = stream.snapshot(1_000)
assert.equal(state.airspeed, 36)
assert.deepEqual(state.mag, [20, -3, 40])
assert.equal(state.altitude, null, "pitot differential cannot stand in for altitude")
stream.apply({...imu, differentialPa: null, acceleration: null}, 1_100)
assert.equal(stream.snapshot(1_100).airspeed, null)
assert.equal(stream.snapshot(1_100).accel, null)

const gps = {name: "gps", timeUs: "1000000", latitude: 44, longitude: 5, altitudeM: 1_000, velocityMps: 50, courseDeg: 90, fix: 3, satellites: 12}
stream.apply({...gps, fix: 1}, 1_200)
assert.equal(stream.snapshot(1_200).gps, null)
assert.equal(stream.snapshot(1_200).altitude, null)
assert.equal(stream.track.length, 0, "no fix must not create a track position")
stream.apply(gps, 2_000)
stream.apply({...gps, timeUs: "2000000", altitudeM: 990, longitude: 5.001}, 3_000)
state = stream.snapshot(3_000)
assert.equal(state.altitude, 990, "GPS altitude must update after its first fix")
assert.equal(state.verticalSpeed, -10)
assert.equal(state.glide, 5)
stream.apply({name: "attitude", rollDeg: 10, pitchDeg: 20, yawDeg: 30}, 3_100)
stream.apply({name: "attitude", rollDeg: 40, pitchDeg: 50, yawDeg: 60}, 3_200)
assert.equal(stream.snapshot(3_200).heading, 60, "heading must update on every attitude frame")
stream.apply({name: "heartbeat"}, 5_000)
state = stream.snapshot(5_000)
for (const key of ["airspeed", "altitude", "roll", "pitch", "gps", "pressure", "mag"]) assert.equal(state[key], null, `${key} expires independently of heartbeat`)
stream.apply({...gps, timeUs: "3000000", fix: 2}, 5_100)
assert.equal(stream.snapshot(5_100).altitude, null, "a 2D fix has no valid altitude")
stream.apply({...gps, timeUs: "100000"}, 5_200)
assert.equal(stream.snapshot(5_200).verticalSpeed, null, "a recorder restart resets the climb window")
stream.apply({...gps, latitude: 120}, 5_300)
assert.equal(stream.snapshot(5_300).gps, null)
stream.apply({...imu, differentialPa: -4}, 6_000)
assert.equal(stream.snapshot(6_000).airspeed, 0, "small negative pitot pressure must not yield NaN")

const stationary = JSON.parse(await readFile(new URL("../fixtures/files/signal/pitot_stationary_30cm.json", import.meta.url), "utf8"))
const loads = new SignalTelemetry()
for (const acceleration of [[9.80665, 0, 0], [0, -9.80665, 0], [0, 0, 9.80665], [5.88399, 7.84532, 0]]) {
  const raw = Object.freeze({...imu, acceleration: Object.freeze(acceleration)})
  loads.apply(raw, 1000)
  assert.ok(Math.abs(loads.snapshot(1000).gLoad - 1) < 1e-12, "a tilted or inverted stationary sensor remains at 1 g")
  assert.equal(loads.snapshot(1000).accel, acceleration, "G conversion preserves the raw acceleration vector")
}
loads.apply({...imu, acceleration: [0, 0, 0]}, 1100)
assert.equal(loads.snapshot(1100).gLoad, 0, "zero specific force represents free fall, not missing data")
loads.apply({...imu, acceleration: [0, 0, 19.6133]}, 1200)
assert.equal(loads.snapshot(1200).gLoad, 2, "a 2 g load is not offset or clamped to 1 g")
loads.apply({name: "heartbeat"}, 2700)
assert.equal(loads.snapshot(2700).gLoad, null, "a heartbeat cannot keep stale acceleration or G live")
for (const acceleration of [null, [0, NaN, 0], [0, Infinity, 0], [], [0, 0]]) {
  loads.apply({...imu, acceleration}, 2800)
  assert.equal(loads.snapshot(2800).gLoad, null, "missing or malformed acceleration cannot display a false load")
}
const resting = new SignalTelemetry()
for (const [timeUs, pressure] of stationary.samples) {
  const decoded = Object.freeze({...imu, timeUs: String(timeUs), differentialPa: pressure})
  resting.apply(decoded, timeUs / 1000)
  const actual = resting.snapshot(timeUs / 1000)
  assert.equal(actual.airspeed, 0, "the complete measured stationary sequence remains at zero")
  assert.equal(actual.pressure, pressure, "diagnostic pressure remains the exact received signed value")
}

const pressureFor = speed => 0.5 * 1.225 * (speed / 3.6) ** 2
const speedFor = pressure => Math.sqrt(2 * pressure / 1.225) * 3.6
const put = (telemetry, pressure, time, received = time) => {
  telemetry.apply({...imu, differentialPa: pressure, timeUs: String(time * 1000)}, received)
  return telemetry.snapshot(received).airspeed
}
const metrics = []
for (const speed of [100, 200, 300]) {
  const flight = new SignalTelemetry()
  const raw = [], filtered = []
  for (const [timeUs, noise] of stationary.samples) {
    const pressure = pressureFor(speed) + noise
    raw.push(speedFor(pressure))
    filtered.push(put(flight, pressure, timeUs / 1000))
  }
  assert.ok(filtered.every(value => value > 0 && Math.abs(value - speed) < 0.1), `${speed} km/h: the measured pressure noise has little effect on IAS`)
  assert.ok(Math.max(...filtered) - Math.min(...filtered) < Math.max(...raw) - Math.min(...raw), "smoothing reduces high-speed fluctuation")
  metrics.push({speed, maxErrorKmh: Math.max(...filtered.map(value => Math.abs(value - speed)))})
}

// Same response at different radio rates, including frames delivered together.
const stepResults = []
for (const rate of [5, 10, 20]) {
  for (const [from, to] of [[100, 300], [300, 100]]) {
    const flight = new SignalTelemetry()
    put(flight, pressureFor(from), 0, 1000)
    for (let index = 1; index <= rate; index++) put(flight, pressureFor(to), index * 1000 / rate, 1000)
    const value = flight.snapshot(1000).airspeed
    assert.ok(Math.abs(value - to) < Math.abs(to - from) * 0.05, "at least 95% of a 100-300 km/h step is reached within one second")
    stepResults.push({rate, from, to, value})
    for (let index = rate + 1; index <= 10 * rate; index++) put(flight, pressureFor(to), index * 1000 / rate)
    assert.ok(Math.abs(flight.snapshot(10_000).airspeed - to) < 1e-10, "the filter has no steady-speed bias or speed ceiling")
  }
}
for (const to of [100, 300]) {
  const results = stepResults.filter(result => result.to === to)
  assert.ok(results.every(result => Math.abs(result.value - results[0].value) < 1e-10), "filter timing follows acquisition timestamps, not packet arrival rate")
}

const thresholds = new SignalTelemetry()
let time = 0
const hold = pressure => {
  let value
  for (let i = 0; i < 20; i++) value = put(thresholds, pressure, time += 100)
  return value
}
assert.equal(hold(0.75), 0, "starting inside the hysteresis band stays at zero")
assert.ok(hold(1.5) > 0, "real pressure above the upper threshold leaves zero")
assert.ok(hold(0.75) > 0, "falling into the band does not chatter back to zero")
assert.equal(hold(0.25), 0, "falling below the lower threshold returns to zero")
assert.equal(hold(0.75), 0, "returning to the band does not chatter out of zero")

const recovery = new SignalTelemetry()
put(recovery, pressureFor(300), 1000)
assert.equal(put(recovery, null, 1100), null, "invalid pressure is missing data, never a zero-speed indication")
assert.equal(put(recovery, 0.75, 1200), 0, "recovery discards pre-failure pressure and hysteresis")
put(recovery, pressureFor(300), 2000)
assert.equal(recovery.snapshot(3500).airspeed, null)
assert.equal(put(recovery, 0.75, 4000), 0, "a source gap resets the filter")
put(recovery, pressureFor(300), 4100)
assert.equal(put(recovery, 0.75, 4200, 6000), 0, "a reception gap resets even when source time barely advances")
put(recovery, pressureFor(300), 5000, 6100)
assert.equal(put(recovery, 0.75, 100, 6200), 0, "a recorder reboot resets the filter")
put(recovery, pressureFor(300), 200, 6300)
assert.equal(put(recovery, 0.75, 300, 5000), 0, "a wall-clock rollback resets the filter")
put(recovery, pressureFor(300), 400, 5100)
assert.equal(put(recovery, pressureFor(300), 400, 6700), null, "duplicate source timestamps cannot keep IAS fresh")
for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(put(recovery, invalid, time += 100), null)

const signed = new SignalTelemetry()
put(signed, -10, 0)
assert.equal(put(signed, 1.5, 100), 0, "negative pressure contributes to the filter instead of being clamped before smoothing")
signed.apply({name: "vfr_hud", airspeedMps: 50}, 200)
assert.equal(signed.snapshot(200).airspeed, 180, "an explicit VFR airspeed retains its own meaning")
assert.equal(put(signed, 0.75, 300), 0, "switching back to Pitot starts fresh")
console.log("Signal live values, expiry, raw preservation, Pitot stationary replay, hysteresis, timing and 100-300 km/h response tests passed", {stationarySamples: stationary.samples.length, metrics, stepResults})
