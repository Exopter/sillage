const MAGIC_V2 = 0xfd
const MAGIC_V1 = 0xfe
const CRC_EXTRAS = new Map([[0, 50], [1, 124], [4, 237], [24, 24], [31, 246], [74, 20], [105, 93], [109, 185], [137, 195], [253, 83], [42000, 212]])
const BASE_LENGTHS = new Map([[0, 9], [1, 31], [4, 14], [24, 30], [31, 32], [74, 20], [105, 62], [109, 9], [137, 14], [253, 51], [42000, 48]])
// Firmware /55 explicitly preserves native BNO085 axes in its radio payloads.
const FDR_SENSOR_NATIVE_MODE = 0x46445200
/** @type {Map<string, "sensor_native" | "body_frd_ned">} */
const imuFrames = new Map()

let buffer = new Uint8Array(0)
/** @type {{getSize():number, write(buffer: Uint8Array, options:{at:number}):number, flush():void, close():void} | null} */
let captureHandle = null
let captureOffset = 0
let errors = 0
let ignored = 0
/** @type {Map<string, number>} */
const sequences = new Map()
let dropped = 0
let commands = Promise.resolve()

self.onmessage = (/** @type {MessageEvent<unknown>} */ { data }) => {
  // Finish opening the capture before consuming the first USB chunk or closing it.
  commands = commands.then(() => handleCommand(data))
  return commands
}

/** @param {unknown} data */
async function handleCommand(data) {
  if (!data || typeof data !== "object" || !("type" in data)) return

  if (data.type === "init-capture" && "filename" in data && typeof data.filename === "string" && /^[A-Za-z0-9._-]+$/.test(data.filename)) {
    await openCapture(data.filename)
  } else if (data.type === "bytes" && "bytes" in data && data.bytes instanceof ArrayBuffer && "receivedAtUs" in data && typeof data.receivedAtUs === "string" && /^\d{1,16}$/.test(data.receivedAtUs)) {
    feed(new Uint8Array(data.bytes), data.receivedAtUs)
  } else if (data.type === "close") {
    closeCapture()
    send({ type: "capture-closed", bytes: captureOffset })
  }
}

/** @param {string} filename */
async function openCapture(filename) {
  try {
    const root = await navigator.storage.getDirectory()
    const file = await root.getFileHandle(filename, { create: true })
    const syncFile = /** @type {FileSystemFileHandle & {createSyncAccessHandle(): Promise<NonNullable<typeof captureHandle>>}} */ (file)
    captureHandle = await syncFile.createSyncAccessHandle()
    captureOffset = captureHandle.getSize()
    send({ type: "capture-ready", filename, bytes: captureOffset })
  } catch (error) {
    send({ type: "capture-error", message: error instanceof Error ? error.message : String(error) })
  }
}

function closeCapture() {
  if (!captureHandle) return
  captureHandle.flush()
  captureHandle.close()
  captureHandle = null
}

/** @param {Uint8Array} chunk @param {string} receivedAtUs */
function feed(chunk, receivedAtUs) {
  const combined = new Uint8Array(buffer.length + chunk.length)
  combined.set(buffer)
  combined.set(chunk, buffer.length)
  buffer = combined

  while (buffer.length) {
    let start = -1
    for (let index = 0; index < buffer.length; index += 1) {
      if (buffer[index] === MAGIC_V2 || buffer[index] === MAGIC_V1) {
        start = index
        break
      }
    }
    if (start < 0) {
      ignored += buffer.length
      buffer = new Uint8Array(0)
      break
    }
    if (start > 0) {
      ignored += start
      buffer = buffer.slice(start)
    }
    if (buffer.length < 2) break

    const isV2 = buffer[0] === MAGIC_V2
    const signatureLength = isV2 && (buffer[2] & 0x01) ? 13 : 0
    const frameLength = (isV2 ? 12 : 8) + buffer[1] + signatureLength
    if (buffer.length < frameLength) break

    const raw = buffer.slice(0, frameLength)
    buffer = buffer.slice(frameLength)
    const timestampUs = BigInt(receivedAtUs || Date.now() * 1000)
    appendCapture(timestampUs, raw)
    if (isV2 && raw[2] !== 0) {
      errors += 1
      continue
    }

    const messageId = isV2 ? raw[7] | (raw[8] << 8) | (raw[9] << 16) : raw[5]
    const extra = CRC_EXTRAS.get(messageId)
    if (extra == null) {
      ignored += 1
      continue
    }
    const stored = raw[raw.length - 2] | (raw[raw.length - 1] << 8)
    if (x25Crc(raw.slice(1, -2), extra) !== stored) {
      errors += 1
      continue
    }

    const sequence = isV2 ? raw[4] : raw[2]
    const systemId = isV2 ? raw[5] : raw[3]
    const componentId = isV2 ? raw[6] : raw[4]
    const source = `${systemId}/${componentId}`
    const lastSequence = sequences.get(source)
    if (lastSequence != null) {
      const delta = (sequence - lastSequence + 256) % 256
      if (delta > 1 && delta < 128) dropped += delta - 1
      if (delta > 0 && delta < 128) sequences.set(source, sequence)
    } else {
      sequences.set(source, sequence)
    }

    let payload = raw.slice(isV2 ? 10 : 6, -2)
    const baseLength = BASE_LENGTHS.get(messageId) || 0
    if (!payload.length || (!isV2 && payload.length < baseLength)) {
      errors += 1
      continue
    }
    // MAVLink 2 removes trailing zero bytes, including fields from the base message.
    if (isV2 && payload.length < baseLength) {
      const padded = new Uint8Array(baseLength)
      padded.set(payload)
      payload = padded
    }
    if (messageId === 0) {
      const heartbeat = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
      const native = componentId === 191 && payload[4] === 18 && payload[5] === 8
        && (payload[6] & 1) !== 0 && heartbeat.getUint32(0, true) === FDR_SENSOR_NATIVE_MODE
      imuFrames.set(source, native ? "sensor_native" : "body_frd_ned")
    }
    const coordinateFrame = imuFrames.get(source) ?? (componentId === 191 ? null : "body_frd_ned")
    const decoded = decode(messageId, payload, coordinateFrame)
    const transferableRaw = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    send({
      type: "frame",
      messageId,
      systemId,
      componentId,
      sequence,
      receivedAtUs: timestampUs.toString(),
      decoded,
      parser: { errors, ignored, dropped },
      raw: transferableRaw
    }, [transferableRaw])
  }
}

/** @param {bigint} receivedAtUs @param {Uint8Array} raw */
function appendCapture(receivedAtUs, raw) {
  if (!captureHandle) return
  const record = new Uint8Array(10 + raw.length)
  const view = new DataView(record.buffer)
  view.setBigUint64(0, receivedAtUs, true)
  view.setUint16(8, raw.length, true)
  record.set(raw, 10)
  try {
    captureHandle.write(record, { at: captureOffset })
    captureOffset += record.length
    if (captureOffset % 8192 < record.length) captureHandle.flush()
  } catch (error) {
    try { captureHandle.close() } catch (_) { /* Preserve decoding after storage failure. */ }
    captureHandle = null
    send({ type: "capture-error", message: error instanceof Error ? error.message : String(error) })
  }
}

/** @param {number} messageId @param {Uint8Array} payload @param {"sensor_native" | "body_frd_ned" | null} coordinateFrame @returns {import("../app/javascript/types/signal").DecodedMessage} */
function decode(messageId, payload, coordinateFrame) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const f32 = (/** @type {number} */ offset) => view.getFloat32(offset, true)
  const u16 = (/** @type {number} */ offset) => view.getUint16(offset, true)
  const i16 = (/** @type {number} */ offset) => view.getInt16(offset, true)
  const u32 = (/** @type {number} */ offset) => view.getUint32(offset, true)
  const i32 = (/** @type {number} */ offset) => view.getInt32(offset, true)

  if (messageId === 42000 && payload.length >= 48) {
    const deviceId = new TextDecoder().decode(payload.slice(32, 48)).split("\0")[0]
    const heading = f32(12)
    if (!/^ECU-[A-F0-9]{6}$/.test(deviceId)) return { name: "unknown" }
    return { name: "imu_quality", deviceId, bootId: u32(0), timeBootMs: u32(4), imuEpoch: u32(8),
      firmware: `fdr_integrated/${u16(16)}`, headingAccuracyDeg: Number.isFinite(heading) && heading >= 0 ? radiansToDegrees(heading) : null,
      agesMs: [u16(18), u16(20), u16(22), u16(24)], validity: u16(26), accuracy: Array.from(payload.slice(28, 32)) }
  }
  if (messageId === 0 && payload.length >= 9) {
    return { name: "heartbeat", customMode: u32(0), type: payload[4], autopilot: payload[5], baseMode: payload[6], systemStatus: payload[7] }
  }
  if (messageId === 1 && payload.length >= 31) {
    return { name: "system_status", sensorsPresent: u32(0), sensorsEnabled: u32(4), sensorsHealthy: u32(8), loadPermille: u16(12), voltageMv: u16(14), batteryRemaining: new Int8Array(payload.buffer, payload.byteOffset + 30, 1)[0] }
  }
  if (messageId === 4 && payload.length >= 14) {
    return { name: "ping", timeUs: view.getBigUint64(0, true).toString(), sequence: u32(8), targetSystem: payload[12], targetComponent: payload[13] }
  }
  if (messageId === 24 && payload.length >= 30) {
    const optional = (/** @type {number} */ offset) => u16(offset) === 65535 ? null : u16(offset) / 100
    return { name: "gps", timeUs: view.getBigUint64(0, true).toString(), latitude: i32(8) / 1e7, longitude: i32(12) / 1e7, altitudeM: i32(16) / 1000, hdop: optional(20), vdop: optional(22), velocityMps: optional(24), courseDeg: optional(26), fix: payload[28], satellites: payload[29] === 255 ? null : payload[29] }
  }
  if (messageId === 31 && payload.length >= 32) {
    // Wait for this recorder's heartbeat before choosing its attitude convention.
    if (coordinateFrame == null) return { name: "unknown" }
    const quaternion = [f32(4), f32(8), f32(12), f32(16)]
    const norm = Math.hypot(...quaternion)
    if (!Number.isFinite(norm) || norm < 0.5 || norm > 1.5) return { name: "unknown" }
    for (let index = 0; index < quaternion.length; index += 1) quaternion[index] /= norm
    const [w, x, y, z] = quaternion
    const rollDeg = radiansToDegrees(Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)))
    const pitch = radiansToDegrees(Math.asin(clamp(2 * (w * y - z * x), -1, 1)))
    const yaw = radiansToDegrees(Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))
    // Instruments use sensor +X forward, +Y left, +Z up for native ENU data.
    // Preserve the received quaternion and angular rates for storage/export.
    const native = coordinateFrame === "sensor_native"
    return { name: "attitude", timeBootMs: u32(0), coordinateFrame, quaternion, rollDeg, pitchDeg: native ? -pitch : pitch, yawDeg: normalizeDegrees(native ? 90 - yaw : yaw), rollSpeed: f32(20), pitchSpeed: f32(24), yawSpeed: f32(28) }
  }
  if (messageId === 74 && payload.length >= 20) {
    return { name: "vfr_hud", airspeedMps: f32(0), groundspeedMps: f32(4), altitudeM: f32(8), climbMps: f32(12), headingDeg: i16(16), throttlePercent: u16(18) }
  }
  if (messageId === 109 && payload.length >= 9) {
    return { name: "radio", rxErrors: u16(0), fixed: u16(2), rssi: payload[4], remoteRssi: payload[5], txBufferPercent: payload[6], noise: payload[7], remoteNoise: payload[8], rssiDbm: payload[4] / 1.9 - 127, remoteRssiDbm: payload[5] / 1.9 - 127 }
  }
  if (messageId === 105 && payload.length >= 62) {
    const vector = (/** @type {number} */ offset, scale = 1) => {
      const values = [f32(offset), f32(offset + 4), f32(offset + 8)].map((value) => value * scale)
      return values.every(Number.isFinite) ? values : null
    }
    const finite = (/** @type {number} */ offset, scale = 1) => Number.isFinite(f32(offset)) ? f32(offset) * scale : null
    return { name: "highres_imu", coordinateFrame, timeUs: view.getBigUint64(0, true).toString(), acceleration: vector(8), angularVelocity: vector(20), magneticField: vector(32, 100), absolutePa: finite(44, 100), differentialPa: finite(48, 100), pressureAltitudeM: finite(52), temperatureC: finite(56), fieldsUpdated: u16(60) }
  }
  if (messageId === 137 && payload.length >= 14) {
    return { name: "pressure", timeBootMs: u32(0), absoluteHpa: f32(4), differentialHpa: f32(8), temperatureC: i16(12) / 100 }
  }
  if (messageId === 253 && payload.length >= 2) {
    const end = payload.slice(1, 51).indexOf(0)
    const text = new TextDecoder().decode(payload.slice(1, end < 0 ? Math.min(51, payload.length) : end + 1))
    return { name: "status_text", severity: payload[0], text }
  }
  return { name: "unknown" }
}

/** @param {Uint8Array} bytes @param {number} extra */
function x25Crc(bytes, extra) {
  let crc = 0xffff
  for (const value of bytes) crc = x25Accumulate(value, crc)
  return x25Accumulate(extra, crc)
}

/** @param {number} value @param {number} crc */
function x25Accumulate(value, crc) {
  let temporary = value ^ (crc & 0xff)
  temporary ^= (temporary << 4) & 0xff
  return ((crc >> 8) ^ (temporary << 8) ^ (temporary << 3) ^ (temporary >> 4)) & 0xffff
}

/** @param {number} value */
function radiansToDegrees(value) { return value * 180 / Math.PI }
/** @param {number} value */
function normalizeDegrees(value) { return (value + 360) % 360 }
/** @param {number} value @param {number} minimum @param {number} maximum */
function clamp(value, minimum, maximum) { return Math.min(Math.max(value, minimum), maximum) }

/** @param {import("../app/javascript/types/signal").CaptureMessage} message @param {Transferable[]} [transfer] */
function send(message, transfer = []) { self.postMessage(message, transfer) }
