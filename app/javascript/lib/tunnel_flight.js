// Derived values of a tunnel flight record. The tunnel has no GPS: the record is read from
// the pitot, the recorder IMU and the glide ratio set on the tunnel.

const DEGREES = 180 / Math.PI
const STANDARD_GRAVITY = 9.80665
const AIR_DENSITY = 1.225
/** Below this dynamic pressure (about 65 km/h) the wing cannot be flying. Shared with Signal Tunnel. */
export const FLYING_PRESSURE_PA = 200

/** @typedef {{t: number, readings?: Record<string, unknown>}} TunnelSample */

/** @param {unknown} value @returns {number|null} */
function finite(value) {
  const number = typeof value === "number" ? value : value == null || value === "" ? NaN : Number(value)
  return Number.isFinite(number) ? number : null
}

/** Angle of the tunnel airflow below the horizon, in degrees. @param {unknown} glideRatio */
export function airflowAngle(glideRatio) {
  const ratio = finite(glideRatio)
  return ratio && ratio > 0 ? Math.atan(1 / ratio) * DEGREES : null
}

/** Pitch and roll in degrees from a recorded orientation sample. Installed readings already
 * carry both; a native sample only carries its quaternion.
 * @param {Record<string, unknown>|undefined} readings @returns {{pitch: number, roll: number}|null}
 */
export function attitudeFromReadings(readings) {
  if (!readings) return null
  const pitch = finite(readings.pitchDeg), roll = finite(readings.rollDeg)
  if (pitch != null && roll != null) return { pitch, roll }
  const w = finite(readings.w), x = finite(readings.x), y = finite(readings.y), z = finite(readings.z)
  if (w == null || x == null || y == null || z == null) return null
  const length = Math.hypot(w, x, y, z)
  if (length < 0.5 || length > 1.5) return null
  const a = w / length, b = x / length, c = y / length, d = z / length
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (a * c - d * b)))) * DEGREES,
    roll: Math.atan2(2 * (a * b + c * d), 1 - 2 * (b * b + c * c)) * DEGREES
  }
}

/** Dynamic pressure of the airflow in pascals: the pitot differential pressure, or the
 * pressure of the recorded airspeed when the differential is missing.
 * @param {Record<string, unknown>|undefined} readings
 */
export function dynamicPressure(readings) {
  const differential = finite(readings?.differential_pressure_pa)
  if (differential != null) return differential
  const airspeed = finite(readings?.airspeed_m_s)
  return airspeed == null ? null : 0.5 * AIR_DENSITY * airspeed * airspeed
}

/** Lift coefficient needed to hold a steady flight on a slack tether: the part of the weight
 * across the airflow over dynamic pressure times wing area. Withheld while the wing cannot fly.
 * @param {number|null} pressure @param {number|null} angle Airflow angle in degrees. @param {number} mass @param {number} area
 */
export function liftNeeded(pressure, angle, mass, area) {
  if (pressure == null || angle == null || pressure < FLYING_PRESSURE_PA || !(mass > 0) || !(area > 0)) return null
  return mass * STANDARD_GRAVITY * Math.cos(angle / DEGREES) / (pressure * area)
}

/** From the first to the last pitot sample at flying pressure.
 * @param {TunnelSample[]} airspeedRows @returns {[number, number]|null}
 */
export function flyingRange(airspeedRows) {
  const flying = airspeedRows.filter((row) => (dynamicPressure(row.readings) ?? 0) >= FLYING_PRESSURE_PA)
  if (flying.length < 2) return null
  const start = flying[0].t, end = flying[flying.length - 1].t
  return end > start ? [start, end] : null
}

/** The sample closest to an elapsed time, when one lies within the tolerance.
 * @template {{t: number}} T @param {T[]} rows Sorted by time. @param {number} elapsed @param {number} [tolerance]
 * @returns {T|null}
 */
export function nearestSample(rows, elapsed, tolerance = 1) {
  if (rows.length === 0 || !Number.isFinite(elapsed)) return null
  let low = 0, high = rows.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (rows[middle].t <= elapsed) low = middle
    else high = middle
  }
  const row = Math.abs(rows[high].t - elapsed) < Math.abs(rows[low].t - elapsed) ? rows[high] : rows[low]
  return Math.abs(row.t - elapsed) <= tolerance ? row : null
}

/** @param {number} value @param {number} [digits] */
export function signed(value, digits = 1) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`
}
