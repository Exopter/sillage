const FRESH_MS = 1_500
const PITOT_TIME_CONSTANT_MS = 250
const PITOT_ZERO_ENTER_PA = 0.5
const PITOT_ZERO_EXIT_PA = 1
const STANDARD_AIR_DENSITY = 1.225
const STANDARD_GRAVITY = 9.80665

/** Live measurements are expired independently, so a heartbeat cannot keep a failed sensor alive. */
export class SignalTelemetry {
  /** @type {Map<string, {value: number | number[] | null, at: number}>} */
  values = new Map()
  /** @type {number[][]} */
  track = []
  /** @type {{time: number, altitude: number}[]} */
  altitudeWindow = []
  /** @type {{pressurePa: number, timeMs: number, receivedAt: number, sourceClock: boolean, zero: boolean} | null} */
  pitotDisplay = null

  /** @param {string} key @param {number | number[] | null} value @param {number} now */
  set(key, value, now) {
    const valid = Array.isArray(value) ? value.every(Number.isFinite) : Number.isFinite(value)
    this.values.set(key, { value: valid ? value : null, at: now })
  }

  /** @param {string} key @param {number} now @returns {number | null} */
  number(key, now) {
    const item = this.values.get(key)
    return item && now - item.at < FRESH_MS && typeof item.value === "number" ? item.value : null
  }

  /** @param {string} key @param {number} now @returns {number[] | null} */
  vector(key, now) {
    const item = this.values.get(key)
    return item && now - item.at < FRESH_MS && Array.isArray(item.value) ? item.value : null
  }

  /** Display-only conditioning; raw pressure and decoded recording payloads stay unchanged.
   * @param {number | null} pressurePa @param {string} timeUs @param {number} now
   */
  updatePitotAirspeed(pressurePa, timeUs, now) {
    if (pressurePa == null || !Number.isFinite(pressurePa)) {
      this.pitotDisplay = null
      this.set("airspeed", null, now)
      return
    }

    const sourceMs = Number(timeUs) / 1_000
    const sourceClock = typeof timeUs === "string" && timeUs.length > 0 && Number.isFinite(sourceMs) && sourceMs >= 0
    const timeMs = sourceClock ? sourceMs : now
    const previous = this.pitotDisplay
    const elapsed = previous ? timeMs - previous.timeMs : 0
    // Batched radio frames retain their acquisition timing. Duplicates cannot revive stale IAS.
    if (previous && sourceClock === previous.sourceClock && elapsed === 0 && now >= previous.receivedAt) return
    const reset = !previous || sourceClock !== previous.sourceClock || elapsed < 0 || elapsed >= FRESH_MS ||
      now < previous.receivedAt || now - previous.receivedAt >= FRESH_MS
    // Filter signed pressure before the square root to avoid rectifying zero-mean noise.
    const filtered = reset ? pressurePa : previous.pressurePa +
      -Math.expm1(-elapsed / PITOT_TIME_CONSTANT_MS) * (pressurePa - previous.pressurePa)
    const wasZero = reset || previous.zero
    const zero = filtered <= (wasZero ? PITOT_ZERO_EXIT_PA : PITOT_ZERO_ENTER_PA)
    this.pitotDisplay = {pressurePa: filtered, timeMs, receivedAt: now, sourceClock, zero}
    // IAS uses standard sea-level density. No sensor zero or calibration is changed here.
    this.set("airspeed", zero ? 0 : Math.sqrt(2 * filtered / STANDARD_AIR_DENSITY) * 3.6, now)
  }

  /** @param {import("../types/signal").DecodedMessage} decoded @param {number} now */
  apply(decoded, now) {
    if (decoded.name === "highres_imu") {
      this.set("accel", decoded.acceleration, now)
      this.set("gyro", decoded.angularVelocity, now)
      this.set("mag", decoded.magneticField, now)
      this.set("pressure", decoded.differentialPa, now)
      this.set("temperature", decoded.temperatureC, now)
      this.updatePitotAirspeed(decoded.differentialPa, decoded.timeUs, now)
    } else if (decoded.name === "attitude") {
      this.set("roll", decoded.rollDeg, now)
      this.set("pitch", decoded.pitchDeg, now)
      this.set("heading", decoded.yawDeg, now)
    } else if (decoded.name === "gps") {
      this.set("fix", decoded.fix, now)
      this.set("satellites", decoded.satellites, now)
      const positionValid = decoded.fix >= 2 && Math.abs(decoded.latitude) <= 90 && Math.abs(decoded.longitude) <= 180
      this.set("gps", positionValid ? [decoded.longitude, decoded.latitude] : null, now)
      this.set("groundspeed", positionValid ? decoded.velocityMps : null, now)
      this.set("course", positionValid ? decoded.courseDeg : null, now)
      this.set("altitude", positionValid && decoded.fix >= 3 ? decoded.altitudeM : null, now)
      const position = this.vector("gps", now)
      if (position) {
        this.track.push(position)
        if (this.track.length > 600) this.track.shift()
      }
      const altitude = this.number("altitude", now)
      const time = Number(decoded.timeUs) / 1_000_000
      const previous = this.altitudeWindow.at(-1)
      if (altitude == null || !Number.isFinite(time) || (previous && (time <= previous.time || time - previous.time > 1.5))) this.altitudeWindow = []
      if (altitude != null && Number.isFinite(time)) this.altitudeWindow.push({ time, altitude })
      while (this.altitudeWindow.length > 1 && time - this.altitudeWindow[1].time > 1) this.altitudeWindow.shift()
      const first = this.altitudeWindow[0]
      this.set("verticalSpeed", first && altitude != null && time - first.time >= 0.8 ? (altitude - first.altitude) / (time - first.time) : null, now)
    } else if (decoded.name === "radio") {
      this.set("radio", decoded.rssiDbm, now)
    } else if (decoded.name === "vfr_hud") {
      this.pitotDisplay = null
      this.set("airspeed", decoded.airspeedMps * 3.6, now)
      this.set("altitude", decoded.altitudeM, now)
      this.set("verticalSpeed", decoded.climbMps, now)
      this.set("groundspeed", decoded.groundspeedMps, now)
      this.set("heading", decoded.headingDeg, now)
    }
  }

  /** @param {number} now */
  snapshot(now) {
    const verticalSpeed = this.number("verticalSpeed", now)
    const groundspeed = this.number("groundspeed", now)
    const acceleration = this.vector("accel", now)
    return {
      heading: this.number("heading", now) ?? this.number("course", now),
      airspeed: this.number("airspeed", now), altitude: this.number("altitude", now), verticalSpeed,
      glide: verticalSpeed != null && verticalSpeed < -0.5 && groundspeed != null ? groundspeed / -verticalSpeed : null,
      roll: this.number("roll", now), pitch: this.number("pitch", now),
      gps: this.vector("gps", now), radio: this.number("radio", now),
      // Total specific-force magnitude: about 1 g at rest, independent of mounting orientation.
      gLoad: acceleration?.length === 3 ? Math.hypot(...acceleration) / STANDARD_GRAVITY : null,
      accel: acceleration, gyro: this.vector("gyro", now), mag: this.vector("mag", now),
      pressure: this.number("pressure", now), temperature: this.number("temperature", now),
      fix: this.number("fix", now), satellites: this.number("satellites", now)
    }
  }
}
