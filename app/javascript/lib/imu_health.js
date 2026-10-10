const G = 9.80665
export const IMU_QUALITY_NAMES = ["Accelerometer", "Gyroscope", "Magnetometer", "Orientation"]
// Bench-confirmed BNO085 report semantics for this firmware. Keep unknown
// revisions strict until their sensor/status contract has been verified.
/** @param {string|undefined} firmware */
export const gyroStatusInformational = firmware => firmware === "fdr_integrated/56"
/** @param {number} value @param {number} index @param {string|undefined} firmware */
export function imuQualityLabel(value, index, firmware) {
  if (value < 0 || value > 3 || !Number.isInteger(value)) return `${IMU_QUALITY_NAMES[index]} unavailable`
  return index === 1 && gyroStatusInformational(firmware)
    ? `Gyroscope status ${value} (diagnostic)` : `${IMU_QUALITY_NAMES[index]} ${value}/3`
}
export const FACE_NAMES = ["x+", "x-", "y+", "y-", "z+", "z-"]
// Guided face holds tolerate hand movement; final reference limits remain separate.
export const FACE_HOLD_RULES = Object.freeze({ enterTiltDeg: 15, exitTiltDeg: 20, maxRateRadS: 0.15, durationMs: 3000 })
const norm = (/** @type {number[]} */ v) => Math.hypot(...v)
const finiteVector = (/** @type {number[] | null} */ v) => v?.length === 3 && v.every(Number.isFinite)
/** @typedef {Extract<import('../types/signal').DecodedMessage, {name:'imu_quality'}>} Quality */
/** @typedef {{t:number, roll:number, pitch:number, accel:number[], gyro:number[], mag:number[], accuracy:number[], heading_accuracy:number, quality_age:number, firmware?:string}} ReferenceSample */

export class ImuHealth {
  /** @type {Quality|null} */ quality = null
  qualityAt = 0
  /** @type {Extract<import('../types/signal').DecodedMessage, {name:'highres_imu'}>|null} */ imu = null
  imuAt = 0
  /** @type {Extract<import('../types/signal').DecodedMessage, {name:'attitude'}>|null} */ attitude = null
  attitudeAt = 0
  jumpUntil = 0
  generation = 0
  /** @type {Map<string, number>} */ pending = new Map()

  /** @param {import('../types/signal').DecodedMessage} d @param {number} now */
  apply(d, now) {
    if (d.name === "imu_quality") {
      const p = this.quality
      if (p && (p.bootId !== d.bootId || p.imuEpoch !== d.imuEpoch || p.deviceId !== d.deviceId || p.firmware !== d.firmware || d.timeBootMs < p.timeBootMs)) {
        this.generation++; this.imu = null; this.attitude = null; this.pending.clear(); this.jumpUntil = 0
      }
      if (p && p.bootId === d.bootId && p.imuEpoch === d.imuEpoch && p.timeBootMs === d.timeBootMs) return
      this.quality = d; this.qualityAt = now
    } else if (d.name === "highres_imu") {
      if (d.timeUs === this.imu?.timeUs) return
      this.imu = d; this.imuAt = now
    } else if (d.name === "attitude") {
      const p = this.attitude
      if (p && d.timeBootMs != null && d.timeBootMs === p.timeBootMs) return
      if (p && p.timeBootMs != null && d.timeBootMs != null) {
        const dt = (d.timeBootMs - p.timeBootMs) / 1000
        const dot = Math.min(1, Math.abs(d.quaternion.reduce((sum, x, i) => sum + x * p.quaternion[i], 0)))
        const angle = 2 * Math.acos(dot)
        const rates = [d.rollSpeed, d.pitchSpeed, d.yawSpeed, p.rollSpeed, p.pitchSpeed, p.yawSpeed]
        if (dt > 0 && dt < 0.4 && rates.every(Number.isFinite)) {
          const predicted = Math.max(norm(rates.slice(0, 3)), norm(rates.slice(3))) * dt
          if (angle > predicted + 0.14) this.jumpUntil = now + 3000
        }
      }
      this.attitude = d; this.attitudeAt = now
    }
  }

  /** @param {number} now */
  sample(now) {
    const q = this.quality, i = this.imu, a = this.attitude
    if (!q || !i || !a || now - this.qualityAt > 1500 || now - this.imuAt > 500 || now - this.attitudeAt > 500 ||
        i.coordinateFrame !== "sensor_native" || a.coordinateFrame !== "sensor_native" ||
        !finiteVector(i.acceleration) || !finiteVector(i.angularVelocity) || !finiteVector(i.magneticField) ||
        q.agesMs.some(age => age + now - this.qualityAt > 1500) || q.headingAccuracyDeg == null) return null
    return /** @type {ReferenceSample} */ ({ t: Number(i.timeUs) / 1000, roll: a.rollDeg, pitch: a.pitchDeg,
      accel: i.acceleration, gyro: i.angularVelocity, mag: i.magneticField,
      accuracy: q.accuracy, heading_accuracy: q.headingAccuracyDeg, quality_age: Math.max(...q.agesMs) + now - this.qualityAt, firmware: q.firmware })
  }

  /** @param {number} now @param {number|null} [referenceField] */
  status(now, referenceField = null) {
    const q = this.quality
    if (!q || now - this.qualityAt > 2500) return { attitude: "unknown", heading: "unknown", reason: q ? "Quality telemetry lost" : "Waiting for quality telemetry (firmware /56+)", issues: ["quality_unavailable"] }
    const i = this.imu, a = this.attitude
    /** @type {string[]} */ const issues = []
    const attitudeMissing = !i || !a || now - this.imuAt > 1500 || now - this.attitudeAt > 1500 || [0,1,3].some(n => q.agesMs[n] + now - this.qualityAt > 2000 || q.accuracy[n] > 3)
    if (attitudeMissing) issues.push("attitude_unavailable")
    const lowAttitude = (gyroStatusInformational(q.firmware) ? [0,3] : [0,1,3]).some(n => q.accuracy[n] < 2)
    const lowHeading = q.accuracy[2] < 2 || q.accuracy[2] > 3 || q.headingAccuracyDeg == null || q.headingAccuracyDeg > 10 || q.agesMs[2] + now - this.qualityAt > 2000
    if (this.sustained("attitude", lowAttitude, now)) issues.push("imu_quality_low")
    if (this.sustained("heading", lowHeading, now)) issues.push("heading_uncertain")
    const magnetic = i?.magneticField
    const field = magnetic && finiteVector(magnetic) ? norm(magnetic) : null
    const disturbed = field != null && (field < 20 || field > 80 || (referenceField != null && Math.abs(field - referenceField) > Math.max(15, referenceField * 0.35)))
    if (this.sustained("magnetic", disturbed, now)) issues.push("magnetic_disturbance")
    // Gravity is only a useful consistency check during a quiet near-1 g window.
    const accel = i?.acceleration, gyro = i?.angularVelocity
    const stationary = accel && gyro && finiteVector(accel) && finiteVector(gyro) && Math.abs(norm(accel) / G - 1) < 0.03 && norm(gyro) < 0.035
    let gravityMismatch = false
    if (stationary && a?.coordinateFrame === "sensor_native" && accel) {
      const [w,x,y,z] = a.quaternion
      const gravity = [2*(x*z-w*y), 2*(w*x+y*z), 1-2*(x*x+y*y)]
      const cosine = gravity.reduce((sum, v, n) => sum + v * accel[n], 0) / norm(accel)
      gravityMismatch = Math.acos(Math.max(-1, Math.min(1, cosine))) > 5 * Math.PI / 180
    }
    if (this.sustained("gravity", gravityMismatch && !attitudeMissing, now)) issues.push("gravity_attitude_mismatch")
    if (now < this.jumpUntil && !attitudeMissing) issues.push("gyro_attitude_mismatch")
    const attitudeBad = issues.some(s => ["imu_quality_low","gravity_attitude_mismatch","gyro_attitude_mismatch"].includes(s))
    const headingBad = issues.some(s => ["heading_uncertain","magnetic_disturbance"].includes(s))
    return { attitude: attitudeMissing ? "unknown" : attitudeBad ? "degraded" : "consistent", heading: attitudeMissing ? "unknown" : headingBad ? "degraded" : "consistent",
      reason: issues.length ? issues.map(s => s.replaceAll("_", " ")).join(" · ") : "Live consistency checks passed", issues }
  }

  /** @param {string} key @param {boolean} bad @param {number} now */
  sustained(key, bad, now) {
    if (!bad) { this.pending.delete(key); return false }
    if (!this.pending.has(key)) this.pending.set(key, now)
    return now - (this.pending.get(key) ?? now) >= 2000
  }
}

/** @param {ReferenceSample} s */
export function referenceIssue(s) {
  const low = s.accuracy.flatMap((v, n) => v > 3 || v < 0 || !Number.isInteger(v) || (v < 2 && !(n === 1 && gyroStatusInformational(s.firmware))) ? [imuQualityLabel(v, n, s.firmware)] : [])
  if (low.length) return `${low.join(" · ")}. Required quality: at least 2/3.`
  if (s.heading_accuracy > 10) return `Heading uncertainty ${s.heading_accuracy.toFixed(1)}°. Required: at most 10°.`
  if (s.quality_age > 1500) return "Quality reports are stale. Check the radio link."
  if (Math.abs(norm(s.accel) / G - 1) > 0.03 || norm(s.gyro) > 0.035) return "Keep the enclosure still"
  if (Math.abs(s.roll) > 2 || Math.abs(s.pitch) > 2) return "Check the level reference in both directions"
  const roll = s.roll * Math.PI / 180, pitch = s.pitch * Math.PI / 180
  const gravity = [Math.sin(pitch), Math.sin(roll) * Math.cos(pitch), Math.cos(roll) * Math.cos(pitch)]
  const cosine = gravity.reduce((sum, v, i) => sum + v * s.accel[i], 0) / norm(s.accel)
  if (cosine < Math.cos(5 * Math.PI / 180)) return "Acceleration and attitude disagree on gravity"
  if (norm(s.mag) < 20 || norm(s.mag) > 80) return "Move magnetic objects away"
  return null
}

/** Collect evidence even when quality is low: the assessment must return a failure, not wait forever. */
export class ReferenceCapture {
  /** @type {ReferenceSample[]} */ samples = []
  /** @param {number} startedAt */
  constructor(startedAt) { this.startedAt = startedAt }
  /** @param {ReferenceSample|null} sample @param {number} now */
  add(sample, now) {
    if (this.done || this.expired(now)) return
    const previous = this.samples.at(-1)
    if (!sample) { this.samples = []; return }
    if (previous && (sample.t < previous.t || sample.t - previous.t > 300)) this.samples = []
    if (sample.t !== this.samples.at(-1)?.t) this.samples.push(sample)
  }
  get elapsed() { return this.samples.length > 1 ? this.samples[this.samples.length - 1].t - this.samples[0].t : 0 }
  get done() { return this.elapsed >= 15000 && this.samples.length >= 100 }
  /** @param {number} now */
  expired(now) { return !this.done && now - this.startedAt >= 45000 }
}

/** Detect six independent static faces from measured acceleration, not the animation. */
export class SixFaceCapture {
  /** @type {Record<string, number>} */ completed = {}
  face = ""
  dwell = 0
  lastTime = -1
  aligned = false
  positioned = false
  /** @param {ReferenceSample|null} s @param {string} [expectedFace] */
  add(s, expectedFace = "") {
    if (!s) { this.dwell = 0; this.lastTime = -1; this.aligned = false; this.positioned = false; return }
    const magnitude = norm(s.accel)
    const axis = s.accel.map(Math.abs).indexOf(Math.max(...s.accel.map(Math.abs)))
    const face = "xyz"[axis] + (s.accel[axis] > 0 ? "+" : "-")
    const dt = s.t - this.lastTime
    const wasAligned = this.aligned
    const continuing = wasAligned && face === this.face && dt >= 0 && dt <= 300
    const tolerance = continuing ? FACE_HOLD_RULES.exitTiltDeg : FACE_HOLD_RULES.enterTiltDeg
    this.positioned = Math.abs(s.accel[axis]) / magnitude >= Math.cos(tolerance * Math.PI / 180) && (!expectedFace || face === expectedFace)
    const still = norm(s.gyro) <= FACE_HOLD_RULES.maxRateRadS && Math.abs(magnitude / G - 1) < 0.08 && this.positioned
    this.aligned = Boolean(still)
    if (!still || !wasAligned || face !== this.face || dt < 0 || dt > 300) this.dwell = 0
    else if (dt > 0) this.dwell += dt
    this.face = face; this.lastTime = s.t
    if (this.dwell >= FACE_HOLD_RULES.durationMs) this.completed[face] = this.dwell
  }
  get done() { return FACE_NAMES.every(face => this.completed[face] >= FACE_HOLD_RULES.durationMs) }
}
