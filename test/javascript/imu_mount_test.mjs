import assert from "node:assert/strict"
import {readFile} from "node:fs/promises"
import {BELLY_MOUNT, NATIVE_MOUNT, UPSIDE_DOWN_MOUNT, bellyAttitude, mountedAttitude, mountName, mountZero, multiplyQuaternion, mountedVector, mountedReference, interpretImu} from "../../app/javascript/lib/imu_mount.js"
import {referenceIssue} from "../../app/javascript/lib/imu_health.js"

// Golden poses were generated from body-to-NED rotation matrices, independently of the quaternion implementation.
const cases = JSON.parse(await readFile(new URL("../fixtures/files/imu_mount_cases.json", import.meta.url)))
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`)
for (const pose of cases) {
  const result = bellyAttitude(pose.quaternion)
  close(result.rollDeg, pose.roll)
  close(result.pitchDeg, pose.pitch)
  close((result.yawDeg - pose.heading + 540) % 360 - 180, 0)
  const inverted = bellyAttitude(pose.quaternion.map(v => -v))
  close(inverted.rollDeg, pose.roll)
  close(inverted.pitchDeg, pose.pitch)
  close(Math.hypot(...mountedVector(pose.accel, BELLY_MOUNT)), 9.80665)
  const flipped = mountedAttitude(pose.upside_down.quaternion, UPSIDE_DOWN_MOUNT)
  close(flipped.rollDeg, pose.roll)
  close(flipped.pitchDeg, pose.pitch)
  close((flipped.yawDeg - pose.heading + 540) % 360 - 180, 0)
  mountedVector(pose.accel, BELLY_MOUNT).forEach((value, axis) => close(mountedVector(pose.upside_down.accel, UPSIDE_DOWN_MOUNT)[axis], value))
}
const vector = Object.freeze([1, 2, 3])
assert.deepEqual(mountedVector(vector, BELLY_MOUNT), [2, -1, 3])
assert.equal(mountedVector(vector, NATIVE_MOUNT), vector)
assert.equal(bellyAttitude([0, 0, 0, 0]), null)
assert.equal(bellyAttitude([NaN, 0, 0, 0]), null)
const raw = Object.freeze({name: "attitude", coordinateFrame: "sensor_native", quaternion: [0, 0, 1, 0], rollDeg: 180, pitchDeg: 0, yawDeg: 270, rollSpeed: 1, pitchSpeed: 2, yawSpeed: 3})
const display = interpretImu(raw, BELLY_MOUNT)
const live = interpretImu({name: 'live_instruments', attitude: raw, differentialPa: 61.25, gLoad: 1.5}, BELLY_MOUNT)
assert.deepEqual(live.attitude, display, 'compact telemetry uses the same installation correction')
assert.equal(live.differentialPa, 61.25)
assert.equal(live.gLoad, 1.5)
close(display.rollDeg, 0); close(display.pitchDeg, 0); close(display.yawDeg, 0)
assert.deepEqual([display.rollSpeed, display.pitchSpeed, display.yawSpeed], [2, -1, 3])
assert.equal(raw.rollDeg, 180)
assert.equal(interpretImu(display, BELLY_MOUNT), display, "legacy body data cannot be transformed again")
assert.equal(interpretImu(raw, NATIVE_MOUNT), raw)
const sample = {t: 0, roll: 180, pitch: 0, quaternion: [0, 0, 1, 0], accel: [0, 0, -9.80665], gyro: [0, 0, 0], mag: [20, 0, 25], accuracy: [3, 0, 3, 3], heading_accuracy: 3, quality_age: 10}
assert.equal(referenceIssue(mountedReference(sample, BELLY_MOUNT)), null, "installed level reference accepts IMU top toward the ground")
assert.ok(referenceIssue(mountedReference({...sample, quaternion: [1, 0, 0, 0], accel: [0, 0, 9.80665]}, BELLY_MOUNT)), "the upright board is not the installed level reference")
assert.equal(sample.roll, 180, "calibration evidence remains native")
assert.equal(mountedReference({...sample, quaternion: undefined}, BELLY_MOUNT), null)
// Upside down: the enclosure is rolled 180 degrees, so the sensor axes already are forward, right, down.
const flippedRaw = Object.freeze({name: "attitude", coordinateFrame: "sensor_native", quaternion: [0, Math.SQRT1_2, Math.SQRT1_2, 0], rollDeg: 180, pitchDeg: 0, yawDeg: 90, rollSpeed: 1, pitchSpeed: 2, yawSpeed: 3})
const flippedDisplay = interpretImu(flippedRaw, UPSIDE_DOWN_MOUNT)
close(flippedDisplay.rollDeg, 0); close(flippedDisplay.pitchDeg, 0); close(flippedDisplay.yawDeg, 0)
assert.equal(flippedDisplay.coordinateFrame, "body_frd_ned")
assert.deepEqual([flippedDisplay.rollSpeed, flippedDisplay.pitchSpeed, flippedDisplay.yawSpeed], [1, 2, 3])
assert.equal(interpretImu(flippedDisplay, UPSIDE_DOWN_MOUNT), flippedDisplay, "upside down body data cannot be transformed again")
assert.deepEqual(mountedVector(vector, UPSIDE_DOWN_MOUNT), [1, 2, 3])
const flippedSample = {...sample, quaternion: [0, Math.SQRT1_2, Math.SQRT1_2, 0]}
assert.equal(referenceIssue(mountedReference(flippedSample, UPSIDE_DOWN_MOUNT)), null, "upside down level reference accepts IMU top toward the ground")
assert.ok(referenceIssue(mountedReference({...flippedSample, quaternion: [1, 0, 0, 0], accel: [0, 0, 9.80665]}, UPSIDE_DOWN_MOUNT)), "the upright board is not the upside down level reference")
assert.equal(mountedReference({...flippedSample, quaternion: undefined}, UPSIDE_DOWN_MOUNT), null)
assert.deepEqual([NATIVE_MOUNT, BELLY_MOUNT, UPSIDE_DOWN_MOUNT, "unknown"].map(mountName), ["Native sensor axes", "Wingsuit belly pocket", "Upside down", "Native sensor axes"])
// Wing zero: an upside down IMU tilted 4 degrees in roll while the wing lies flat, heading east.
const half = 4 * Math.PI / 360, east = Math.PI / 4
const tilt = [Math.cos(half), Math.sin(half), 0, 0]
const installedEast = multiplyQuaternion([Math.cos(east), 0, 0, Math.sin(east)], tilt)
const tiltedNative = multiplyQuaternion([0, -Math.SQRT1_2, -Math.SQRT1_2, 0], installedEast)
const tiltedRaw = Object.freeze({name: "attitude", coordinateFrame: "sensor_native", quaternion: tiltedNative, rollDeg: 176, pitchDeg: 0, yawDeg: 0, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 1})
const unzeroed = interpretImu(tiltedRaw, UPSIDE_DOWN_MOUNT)
close(unzeroed.rollDeg, 4); close(unzeroed.yawDeg, 90)
const zeroed = interpretImu(tiltedRaw, UPSIDE_DOWN_MOUNT, tilt)
close(zeroed.rollDeg, 0); close(zeroed.pitchDeg, 0); close(zeroed.yawDeg, 90)
const tiltedGravity = [0, -9.80665 * Math.sin(2 * half), -9.80665 * Math.cos(2 * half)]
mountedVector(tiltedGravity, UPSIDE_DOWN_MOUNT, tilt).forEach((value, axis) => close(value, [0, 0, -9.80665][axis]))
const tiltedSample = {...sample, roll: 176, quaternion: tiltedNative, accel: tiltedGravity}
assert.match(referenceIssue(mountedReference(tiltedSample, UPSIDE_DOWN_MOUNT)), /level/, "the tilted IMU is not level in its mounting")
assert.equal(referenceIssue(mountedReference(tiltedSample, UPSIDE_DOWN_MOUNT, tilt)), null, "the wing zero defines level")
assert.equal(interpretImu(tiltedRaw, NATIVE_MOUNT, tilt), tiltedRaw, "native axes never take a zero")
assert.equal(mountZero(tilt), tilt)
assert.deepEqual([[], null, [1, 0, 0], [2, 0, 0, 0], [NaN, 0, 0, 1]].map(mountZero), [null, null, null, null, null])
console.log("IMU belly and upside down mounts: wing zero, golden poses, rotation signs, vectors, frame guards and reference passed")
