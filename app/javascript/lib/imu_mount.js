export const BELLY_MOUNT = "wingsuit_belly_pocket_v1"
export const NATIVE_MOUNT = "sensor_native"
export const UPSIDE_DOWN_MOUNT = "upside_down_v1"
/** Body FRD to sensor rotation of each installed mounting, scalar first. @type {Record<string, number[]>} */
const BODY_TO_SENSOR = {[BELLY_MOUNT]: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], [UPSIDE_DOWN_MOUNT]: [1, 0, 0, 0]}
/** @type {Record<string, string>} */
const MOUNT_NAMES = {[NATIVE_MOUNT]: "Native sensor axes", [BELLY_MOUNT]: "Wingsuit belly pocket", [UPSIDE_DOWN_MOUNT]: "Upside down"}

/** @param {string} profile */
export function installedMount(profile) { return profile in BODY_TO_SENSOR }
/** @param {string} profile */
export function mountName(profile) { return MOUNT_NAMES[profile] || MOUNT_NAMES[NATIVE_MOUNT] }

/** Hamilton product, scalar first. @param {number[]} a @param {number[]} b */
export function multiplyQuaternion(a, b) {
  const [w,x,y,z] = a, [v,i,j,k] = b
  return [w*v-x*i-y*j-z*k, w*i+x*v+y*k-z*j, w*j-x*k+y*v+z*i, w*k+x*j-y*i+z*v]
}

/** Sensor to body FRD. Belly pocket: forward +Y, right -X, down +Z. Upside down: the sensor axes already are FRD.
 * @param {number[]|null} vector @param {string} profile */
export function mountedVector(vector, profile) { return vector && rotated(vector, profile) }
/** @param {number[]} vector @param {string} profile */
function rotated(vector, profile) { return profile === BELLY_MOUNT ? [vector[1], -vector[0], vector[2]] : vector }

/** Convert native sensor-to-ENU attitude into body-to-NED, without a tare.
 * @param {number[]} quaternion @param {string} profile */
export function mountedAttitude(quaternion, profile) {
  const length = Math.hypot(...quaternion)
  if (quaternion.length !== 4 || !Number.isFinite(length) || length < 0.5 || length > 1.5) return null
  const h = Math.SQRT1_2
  const q = multiplyQuaternion(multiplyQuaternion([0,h,h,0], quaternion.map(v => v / length)), BODY_TO_SENSOR[profile])
  const [w,x,y,z] = q, degrees = 180 / Math.PI
  return {quaternion: q,
    rollDeg: Math.atan2(2*(w*x+y*z), 1-2*(x*x+y*y)) * degrees,
    pitchDeg: Math.asin(Math.max(-1, Math.min(1, 2*(w*y-z*x)))) * degrees,
    yawDeg: (Math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z)) * degrees + 360) % 360}
}

/** @param {number[]} quaternion */
export function bellyAttitude(quaternion) { return mountedAttitude(quaternion, BELLY_MOUNT) }

/** Derived display values only. Legacy body reports are never transformed twice.
 * @param {import('../types/signal').DecodedMessage} decoded @param {string} profile
 * @returns {import('../types/signal').DecodedMessage} */
export function interpretImu(decoded, profile) {
  if (decoded.name === "live_instruments") return {...decoded, attitude: decoded.attitude
    ? /** @type {import('../types/signal').AttitudeTelemetry} */ (interpretImu(decoded.attitude, profile)) : null}
  if (!installedMount(profile) || !("coordinateFrame" in decoded) || decoded.coordinateFrame !== "sensor_native") return decoded
  if (decoded.name === "highres_imu") return {...decoded, coordinateFrame: "body_frd_ned",
    acceleration: mountedVector(decoded.acceleration, profile), angularVelocity: mountedVector(decoded.angularVelocity, profile), magneticField: mountedVector(decoded.magneticField, profile)}
  if (decoded.name === "attitude") {
    const attitude = mountedAttitude(decoded.quaternion, profile)
    if (!attitude) return {...decoded, rollDeg: NaN, pitchDeg: NaN, yawDeg: NaN}
    const [rollSpeed, pitchSpeed, yawSpeed] = rotated([decoded.rollSpeed, decoded.pitchSpeed, decoded.yawSpeed], profile)
    return {...decoded, ...attitude, coordinateFrame: "body_frd_ned", rollSpeed, pitchSpeed, yawSpeed}
  }
  return decoded
}

/** Static assessment in the installed frame; the captured evidence stays native.
 * @param {import('./imu_health').ReferenceSample} sample @param {string} profile */
export function mountedReference(sample, profile) {
  if (!installedMount(profile)) return sample
  const attitude = sample.quaternion && mountedAttitude(sample.quaternion, profile)
  if (!attitude) return null
  return {...sample, roll: attitude.rollDeg, pitch: attitude.pitchDeg, frame: "body_frd_ned",
    accel: rotated(sample.accel, profile), gyro: rotated(sample.gyro, profile), mag: rotated(sample.mag, profile)}
}
