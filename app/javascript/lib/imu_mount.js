export const BELLY_MOUNT = "wingsuit_belly_pocket_v1"
export const NATIVE_MOUNT = "sensor_native"

/** Hamilton product, scalar first. @param {number[]} a @param {number[]} b */
export function multiplyQuaternion(a, b) {
  const [w,x,y,z] = a, [v,i,j,k] = b
  return [w*v-x*i-y*j-z*k, w*i+x*v+y*k-z*j, w*j-x*k+y*v+z*i, w*k+x*j-y*i+z*v]
}

/** Sensor to body FRD: forward +Y, right -X, down +Z.
 * @param {number[]|null} vector @param {string} profile */
export function mountedVector(vector, profile) {
  return vector && profile === BELLY_MOUNT ? [vector[1], -vector[0], vector[2]] : vector
}

/** Convert native sensor-to-ENU attitude into body-to-NED, without a tare.
 * @param {number[]} quaternion */
export function bellyAttitude(quaternion) {
  const length = Math.hypot(...quaternion)
  if (quaternion.length !== 4 || !Number.isFinite(length) || length < 0.5 || length > 1.5) return null
  const h = Math.SQRT1_2
  const q = multiplyQuaternion(multiplyQuaternion([0,h,h,0], quaternion.map(v => v / length)), [h,0,0,h])
  const [w,x,y,z] = q, degrees = 180 / Math.PI
  return {quaternion: q,
    rollDeg: Math.atan2(2*(w*x+y*z), 1-2*(x*x+y*y)) * degrees,
    pitchDeg: Math.asin(Math.max(-1, Math.min(1, 2*(w*y-z*x)))) * degrees,
    yawDeg: (Math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z)) * degrees + 360) % 360}
}

/** Derived display values only. Legacy body reports are never transformed twice.
 * @param {import('../types/signal').DecodedMessage} decoded @param {string} profile
 * @returns {import('../types/signal').DecodedMessage} */
export function interpretImu(decoded, profile) {
  if (profile !== BELLY_MOUNT || !("coordinateFrame" in decoded) || decoded.coordinateFrame !== "sensor_native") return decoded
  if (decoded.name === "highres_imu") return {...decoded, coordinateFrame: "body_frd_ned",
    acceleration: mountedVector(decoded.acceleration, profile), angularVelocity: mountedVector(decoded.angularVelocity, profile), magneticField: mountedVector(decoded.magneticField, profile)}
  if (decoded.name === "attitude") {
    const attitude = bellyAttitude(decoded.quaternion)
    if (!attitude) return {...decoded, rollDeg: NaN, pitchDeg: NaN, yawDeg: NaN}
    return {...decoded, ...attitude, coordinateFrame: "body_frd_ned", rollSpeed: decoded.pitchSpeed, pitchSpeed: -decoded.rollSpeed, yawSpeed: decoded.yawSpeed}
  }
  return decoded
}

/** Static assessment in the installed frame; the captured evidence stays native.
 * @param {import('./imu_health').ReferenceSample} sample @param {string} profile */
export function mountedReference(sample, profile) {
  if (profile !== BELLY_MOUNT) return sample
  const attitude = sample.quaternion && bellyAttitude(sample.quaternion)
  if (!attitude) return null
  return {...sample, roll: attitude.rollDeg, pitch: attitude.pitchDeg, frame: "body_frd_ned",
    accel: [sample.accel[1], -sample.accel[0], sample.accel[2]],
    gyro: [sample.gyro[1], -sample.gyro[0], sample.gyro[2]], mag: [sample.mag[1], -sample.mag[0], sample.mag[2]]}
}
