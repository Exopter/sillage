import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import vm from "node:vm"

const workerSource = await readFile(new URL("../../public/signal_serial_worker.js", import.meta.url), "utf8")
const messages = []
const writes = []
const captureHandle = {
  size: 0,
  flushed: false,
  closed: false,
  getSize() { return this.size },
  write(bytes, { at }) {
    writes.push({ at, bytes: Uint8Array.from(bytes) })
    this.size = Math.max(this.size, at + bytes.length)
  },
  flush() { this.flushed = true },
  close() { this.closed = true }
}
const scope = {
  self: { postMessage: (message) => messages.push(message) },
  navigator: {
    storage: {
      getDirectory: async () => ({
        getFileHandle: async () => ({ createSyncAccessHandle: async () => captureHandle })
      })
    }
  },
  Uint8Array,
  ArrayBuffer,
  Int8Array,
  DataView,
  TextDecoder,
  BigInt,
  Date,
  Map,
  Math
}
vm.createContext(scope)
vm.runInContext(workerSource, scope, { filename: "signal_serial_worker.js" })

for (const data of [null, 42, {}, {type:"future-message"}, {type:"bytes", bytes:new ArrayBuffer(0), receivedAtUs:"NaN"}, {type:"init-capture",filename:"../escape.mavcap"}]) {
  await scope.self.onmessage({data})
}
assert.equal(messages.length, 0, "malformed and unknown commands are ignored without opening a capture")
await scope.self.onmessage({ data: { type: "init-capture", filename: "test.mavcap" } })
assert.equal(messages.shift().type, "capture-ready")

const heartbeat = mavlinkV1Frame({ sequence: 10, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 })
await feed(heartbeat.slice(0, 5), "1000000")
assert.equal(frameMessages().length, 0, "fragmented frame must remain buffered")
await feed(heartbeat.slice(5), "1000001")
assert.equal(frameMessages().at(-1).decoded.name, "heartbeat")

const corrupted = Uint8Array.from(mavlinkV1Frame({ sequence: 11, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 }))
corrupted[corrupted.length - 1] ^= 0xff
await feed(corrupted, "1000002")
assert.equal(frameMessages().length, 1, "bad CRC must not emit telemetry")

await feed(mavlinkV1Frame({ sequence: 12, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 }), "1000003")
assert.equal(frameMessages().at(-1).parser.dropped, 1, "a missing sequence must be reported")
await feed(mavlinkV1Frame({ sequence: 12, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 }), "1000004")
assert.equal(frameMessages().at(-1).parser.dropped, 1, "a duplicate must not create a false gap")
await feed(mavlinkV1Frame({ sequence: 9, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 }), "1000005")
assert.equal(frameMessages().at(-1).parser.dropped, 1, "an out-of-order frame must not create a wrap-sized gap")

const signedFrame = mavlinkV2SignedFrame({ sequence: 13, messageId: 0, payload: new Uint8Array(9) })
const afterSigned = mavlinkV1Frame({ sequence: 14, messageId: 0, payload: new Uint8Array(9), crcExtra: 50 })
await feed(join(signedFrame, afterSigned), "1000006")
assert.equal(frameMessages().at(-1).sequence, 14, "a signed frame must be consumed at its complete length")

const unknown = mavlinkV1Frame({ sequence: 15, messageId: 200, payload: new Uint8Array(0), crcExtra: 0 })
const writesBeforeUnknown = writes.length
await feed(unknown, "1000007")
assert.equal(writes.length, writesBeforeUnknown + 1, "unsupported messages must still enter the raw capture")

// Replay sensor payloads captured from the 100 mW / 10 Hz FDR v52 bench run.
// GPS coordinates in this fixture are redacted; fix and sentinel fields are preserved.
const capture = JSON.parse(await readFile(new URL("../fixtures/files/signal/fdr_v52_payloads.json", import.meta.url), "utf8"))
const extras = new Map([[0, 50], [4, 237], [24, 24], [31, 246], [105, 93], [109, 185]])
const beforeReplay = frameMessages().length
for (const row of capture) {
  const bytes = mavlinkV2Frame({sequence: row.seq, messageId: row.id, payload: Buffer.from(row.payload, "hex"), crcExtra: extras.get(row.id), componentId: 191})
  await feed(bytes.slice(0, 7), "1791540000000000")
  await feed(bytes.slice(7), "1791540000000001")
}
const replay = frameMessages().slice(beforeReplay)
assert.equal(replay.length, capture.length)
assert.equal(replay.some((frame) => frame.decoded.name === "unknown"), false, "truncated MAVLink 2 fields must be restored")
const measuredImu = replay.find((frame) => frame.messageId === 105).decoded
assert.deepEqual([...measuredImu.acceleration], [0, 0.3046875, 9.65234375])
assert.ok(Math.abs(measuredImu.magneticField[0] - 17.375) < 0.001, "gauss is displayed as microtesla")
assert.ok(Math.abs(measuredImu.differentialPa - 0.208019) < 0.00001, "hPa is displayed as Pa")
assert.equal(measuredImu.absolutePa, null, "unavailable absolute pressure stays unavailable")
assert.equal(measuredImu.pressureAltitudeM, null)
const measuredGps = replay.find((frame) => frame.messageId === 24).decoded
assert.equal(measuredGps.hdop, null)
assert.equal(measuredGps.vdop, null)
assert.equal(measuredGps.fix, 1)
assert.equal(measuredGps.satellites, 0, "trailing zero satellites are restored")
assert.equal(replay.find((frame) => frame.messageId === 31).decoded.rollSpeed, 0, "trimmed zero gyro fields decode correctly")

const droppedBeforeInterleave = frameMessages().at(-1).parser.dropped
for (const [systemId, componentId, sequence] of [[2,191,250], [51,68,10], [2,191,251], [51,68,11], [2,191,250], [2,191,252], [2,191,255], [2,191,0]]) {
  await feed(mavlinkV2Frame({systemId, componentId, sequence, messageId: 0, payload: new Uint8Array(9), crcExtra: 50}), "1791540000000002")
}
assert.equal(frameMessages().at(-1).parser.dropped - droppedBeforeInterleave, 2, "separate sources, out-of-order frames and sequence wrap must not invent gaps")

// /55 preserves native sensor axes. Only instrument angles use +X as forward.
let nativeSequence = 0
const nativeHeartbeat = new Uint8Array(9)
new DataView(nativeHeartbeat.buffer).setUint32(0, 0x46445200, true)
nativeHeartbeat.set([18, 8, 1, 4, 3], 4)
const nativeAttitude = (roll, pitch, heading) => {
  const payload = new Uint8Array(32)
  const view = new DataView(payload.buffer)
  const half = (degrees) => degrees * Math.PI / 360
  const cr = Math.cos(half(roll)), sr = Math.sin(half(roll))
  const cp = Math.cos(half(-pitch)), sp = Math.sin(half(-pitch))
  const cy = Math.cos(half(90 - heading)), sy = Math.sin(half(90 - heading))
  const q = [cr*cp*cy + sr*sp*sy, sr*cp*cy - cr*sp*sy, cr*sp*cy + sr*cp*sy, cr*cp*sy - sr*sp*cy]
  q.forEach((value, index) => view.setFloat32(4 + index * 4, value, true))
  return payload
}
const feedNative = async (messageId, payload, systemId = 42) => {
  await feed(mavlinkV2Frame({systemId, componentId:191, sequence:nativeSequence++, messageId, payload, crcExtra:extras.get(messageId)}), "1791626400000000")
  return frameMessages().at(-1).decoded
}
assert.equal((await feedNative(31, nativeAttitude(0, 0, 0))).name, "unknown", "do not guess the FDR frame before its heartbeat")
await feedNative(0, nativeHeartbeat)
for (const [roll, pitch, heading] of [[0,0,0], [0,0,90], [0,0,180], [0,0,270], [30,0,58], [0,20,330], [-25,12,315], [40,-15,85]]) {
  const payload = nativeAttitude(roll, pitch, heading)
  const decoded = await feedNative(31, payload)
  assert.equal(decoded.coordinateFrame, "sensor_native")
  assert.ok(Math.abs(decoded.rollDeg - roll) < 0.0001, "roll follows sensor X")
  assert.ok(Math.abs(decoded.pitchDeg - pitch) < 0.0001, "nose-up pitch follows the native X-forward mounting")
  assert.ok(Math.abs((decoded.yawDeg - heading + 540) % 360 - 180) < 0.0001, "heading is clockwise from magnetic north for sensor X")
  const sourceQuaternion = [...Array(4)].map((_, index) => new DataView(payload.buffer).getFloat32(4 + index * 4, true))
  const length = Math.hypot(...sourceQuaternion)
  decoded.quaternion.forEach((value, index) => assert.equal(value, sourceQuaternion[index] / length, "stored quaternion keeps native components"))
}
const nativeImu = new Uint8Array(62)
const nativeImuView = new DataView(nativeImu.buffer)
for (const [offset, values] of [[8,[1.25,2.5,9.75]], [20,[0.1,0.2,0.3]], [32,[-0.21,0.32,-0.43]]]) {
  values.forEach((value, index) => nativeImuView.setFloat32(offset + 4 * index, value, true))
}
const nativeVectors = await feedNative(105, nativeImu)
assert.deepEqual([...nativeVectors.acceleration], [1.25,2.5,9.75], "native X/Y/Z retain order and signs")
assert.equal(nativeVectors.coordinateFrame, "sensor_native")
nativeVectors.magneticField.forEach((value, index) => assert.ok(Math.abs(value - [-21,32,-43][index]) < 0.0001))

// A different source and a later legacy heartbeat must not inherit native mode.
await feedNative(0, new Uint8Array(9), 43)
const legacyAttitude = await feedNative(31, nativeAttitude(10, -20, 60), 43)
assert.equal(legacyAttitude.coordinateFrame, "body_frd_ned")
assert.ok(Math.abs(legacyAttitude.pitchDeg - 20) < 0.0001)
assert.ok(Math.abs(legacyAttitude.yawDeg - 30) < 0.0001)
assert.equal((await feedNative(31, nativeAttitude(0, 0, 0))).coordinateFrame, "sensor_native", "coordinate conventions are isolated by source")
await feedNative(0, new Uint8Array(9))
assert.equal((await feedNative(31, nativeAttitude(0, 0, 0))).coordinateFrame, "body_frd_ned", "a firmware rollback clears native mode")

await scope.self.onmessage({ data: { type: "close" } })
assert.equal(messages.at(-1).type, "capture-closed")
assert.equal(captureHandle.flushed, true)
assert.equal(captureHandle.closed, true)

console.log("Signal serial worker tests passed")

async function feed(bytes, receivedAtUs) {
  await scope.self.onmessage({ data: { type: "bytes", bytes: exactArrayBuffer(bytes), receivedAtUs } })
}

function frameMessages() {
  return messages.filter((message) => message.type === "frame")
}

function exactArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

function mavlinkV1Frame({ sequence, messageId, payload, crcExtra }) {
  const body = Uint8Array.from([ payload.length, sequence, 1, 1, messageId, ...payload ])
  const crc = x25Crc(body, crcExtra)
  return Uint8Array.from([ 0xfe, ...body, crc & 0xff, crc >> 8 ])
}

function mavlinkV2SignedFrame({ sequence, messageId, payload }) {
  const header = [ 0xfd, payload.length, 0x01, 0, sequence, 1, 1, messageId & 0xff, (messageId >> 8) & 0xff, (messageId >> 16) & 0xff ]
  return Uint8Array.from([ ...header, ...payload, 0, 0, ...new Uint8Array(13) ])
}

function join(...arrays) {
  const result = new Uint8Array(arrays.reduce((total, bytes) => total + bytes.length, 0))
  let offset = 0
  for (const bytes of arrays) {
    result.set(bytes, offset)
    offset += bytes.length
  }
  return result
}

function x25Crc(bytes, extra) {
  let crc = 0xffff
  for (const value of bytes) crc = x25Accumulate(value, crc)
  return x25Accumulate(extra, crc)
}

function x25Accumulate(value, crc) {
  let temporary = value ^ (crc & 0xff)
  temporary ^= (temporary << 4) & 0xff
  return ((crc >> 8) ^ (temporary << 8) ^ (temporary << 3) ^ (temporary >> 4)) & 0xffff
}

function mavlinkV2Frame({sequence, messageId, payload, crcExtra, systemId = 1, componentId = 1}) {
  const body = Uint8Array.from([payload.length, 0, 0, sequence, systemId, componentId, messageId & 255, messageId >> 8 & 255, messageId >> 16 & 255, ...payload])
  const crc = x25Crc(body, crcExtra)
  return Uint8Array.from([0xfd, ...body, crc & 255, crc >> 8])
}

// Production FDR quality dialect, including MAVLink 2 trailing-zero restoration.
const qualityPayload = new Uint8Array(48)
const qualityView = new DataView(qualityPayload.buffer)
qualityView.setUint32(0, 0xfedcba98, true)
qualityView.setUint32(4, 45678, true)
qualityView.setUint32(8, 2, true)
qualityView.setFloat32(12, Math.PI / 60, true)
qualityView.setUint16(16, 56, true)
for (let i = 0; i < 4; i++) { qualityView.setUint16(18 + i * 2, i * 10, true); qualityPayload[28 + i] = i }
qualityView.setUint16(26, 120, true)
qualityPayload.set(new TextEncoder().encode('ECU-A172E0'), 32)
const qualityFrame = new Uint8Array(60)
qualityFrame.set([0xfd,48,0,0,80,1,191,0x10,0xa4,0])
qualityFrame.set(qualityPayload,10)
let qualityCrc=0xffff
for (const byte of [...qualityFrame.slice(1,58),212]) {
  let t=byte^(qualityCrc&255); t^=(t<<4)&255
  qualityCrc=((qualityCrc>>>8)^(t<<8)^(t<<3)^(t>>>4))&65535
}
qualityFrame[58]=qualityCrc&255;qualityFrame[59]=qualityCrc>>>8
await feed(qualityFrame, '900000000')
const qualityDecoded = frameMessages().at(-1).decoded
assert.equal(qualityDecoded.name,'imu_quality')
assert.equal(qualityDecoded.bootId,0xfedcba98)
assert.equal(qualityDecoded.deviceId,'ECU-A172E0')
assert.deepEqual(Array.from(qualityDecoded.accuracy),[0,1,2,3])
assert.ok(Math.abs(qualityDecoded.headingAccuracyDeg-3)<0.001)
